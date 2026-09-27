import sys
import os  
from pathlib import Path

# Add project root to Python path when this file is run directly.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import cv2
import numpy as np
import torch
import librosa
from pathlib import Path
from PIL import Image
import torchvision.transforms.functional as TF

from src.config import settings
from src.models.schemas import CompiledPlan, SegmentSpec

# Add Wav2Lip repo to path so we can import its modules
# Ensure you ran: git clone https://github.com/Rudrabha/Wav2Lip.git external/wav2lip
wav2lip_repo = settings.wav2lip_repo_path
if wav2lip_repo not in sys.path:
    sys.path.insert(0, wav2lip_repo)

try:
    from models import Wav2Lip as Wav2LipModel
except ImportError:
    raise ImportError("Cannot import Wav2Lip model. Did you clone the repo to ./external/wav2lip?")

from src.config import settings
from src.models.schemas import CompiledPlan, SegmentSpec


class RealWav2LipProvider:
    name = "wav2lip_pytorch_cpu"

    def __init__(self):
        print("Loading Wav2Lip model... (This may take 10-20 seconds on first run)")
        self.device = torch.device("cpu")
        
        ckpt_path = Path(settings.wav2lip_ckpt_path)
        if not ckpt_path.exists():
             raise FileNotFoundError(f"Wav2Lip checkpoint not found at {ckpt_path}")

        self.model = Wav2LipModel()
        checkpoint = torch.load(str(ckpt_path), map_location="cpu")

        checkpoint_state = checkpoint["state_dict"]

        # Remove the "module." prefix added by DataParallel during training.
        checkpoint_state = {
            key.replace("module.", "", 1): value
            for key, value in checkpoint_state.items()
        }

        model_state = self.model.state_dict()

        # Keep only parameters that belong to this model.
        checkpoint_state = {
            key: value
            for key, value in checkpoint_state.items()
            if key in model_state
        }

        self.model.load_state_dict(checkpoint_state, strict=False)
        self.model.eval()
        self.model.to(self.device)
        print("Wav2Lip Loaded successfully.")

    def generate_segment(
        self,
        segment: SegmentSpec,
        plan: CompiledPlan,
        job_path: Path,
        identity_pack: dict,
        voice_pack: dict,
    ) -> Path:
        videos_dir = job_path / "videos"
        videos_dir.mkdir(parents=True, exist_ok=True)
        output_path = videos_dir / f"{segment.segment_id}.mp4"
        
        # 1. Load Reference Image
        ref_img_path = identity_pack["canonical_reference_image"]
        img = cv2.imread(ref_img_path)
        if img is None:
            raise ValueError(f"Reference image missing: {ref_img_path}")
            
        # 2. Merge Audio for this segment
        temp_audio = job_path / f"{segment.segment_id}_merged.wav"
        self._merge_audio(segment, temp_audio)
        
        # 3. Process Frames
        fps = plan.video.fps
        num_frames = int(segment.duration_s * fps)
        
        # Load Audio & Compute Mel Spectrogram
        sr = 16000 # Wav2Lip standard SR
        y, _ = librosa.load(str(temp_audio), sr=sr, mono=True)
        
        n_fft = 800
        hop_length = 200
        win_length = 800
        n_mels = 80
        
        mel = librosa.feature.melspectrogram(y=y, sr=sr, n_fft=n_fft, hop_length=hop_length, win_length=win_length, n_mels=n_mels)
        mel_db = librosa.power_to_db(mel, ref=np.max)
        mel_db = (mel_db + 4.0) / 4.0 
        
        # Adjust mel length to match frames
        if mel_db.shape[1] < num_frames:
            pad = num_frames - mel_db.shape[1]
            mel_db = np.pad(mel_db, ((0,0),(0,pad)), mode='edge')
        elif mel_db.shape[1] > num_frames:
            mel_db = mel_db[:, :num_frames]
            
        mel_tensor = torch.FloatTensor(mel_db.T).unsqueeze(0).to(self.device)
        
        # Prepare Input Images
        # Wav2Lip expects 96x96 RGB crops
        bbox = identity_pack["bbox"]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        
        face_crop = img[y1:y2, x1:x2]
        face_resized = cv2.resize(face_crop, (96, 96))
        face_rgb = cv2.cvtColor(face_resized, cv2.COLOR_BGR2RGB)
        
        # Repeat static face for all frames
        input_imgs = np.stack([face_rgb] * num_frames, axis=0)
        # Convert to NCHW format expected by model (Batch, Channel, Height, Width)
        input_imgs = input_imgs.transpose(0, 3, 1, 2) 
        input_imgs = torch.FloatTensor(input_imgs).to(self.device)
        
        generated_faces = []
        batch_size = 8 # Small batch for RAM safety
        
        for i in range(0, num_frames, batch_size):
            batch_end = min(i + batch_size, num_frames)
            batch_mel = mel_tensor[:, i:batch_end, :]
            batch_imgs = input_imgs[i:batch_end]
            
            with torch.no_grad():
                pred = self.model(batch_mel, batch_imgs)
                
                for j in range(pred.shape[0]):
                    face_np = pred[j].permute(1, 2, 0).cpu().numpy()
                    face_np = (face_np * 255).clip(0, 255).astype(np.uint8)
                    generated_faces.append(face_np)
                    
        # 4. Paste Back & Add Procedural Sway
        final_frames = []
        base_img = img.copy()
        
        for idx, gen_face in enumerate(generated_faces):
            frame = base_img.copy()
            orig_w = x2 - x1
            orig_h = y2 - y1
            
            # Resize generated face back to original bbox size
            gen_face_resized = cv2.resize(gen_face, (orig_w, orig_h))
            
            # Paste mouth region
            frame[y1:y2, x1:x2] = gen_face_resized
            
            # Procedural Head Sway (Simulate Life)
            t = idx / fps
            dx = int(2 * np.sin(t * 1.5))
            dy = int(1.5 * np.cos(t * 1.2))
            
            M = np.float32([[1, 0, dx], [0, 1, dy]])
            frame_shifted = cv2.warpAffine(frame, M, (frame.shape[1], frame.shape[0]))
            
            final_frames.append(frame_shifted)
            
        # 5. Write Video
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(str(output_path), fourcc, fps, (img.shape[1], img.shape[0]))
        for f in final_frames:
            writer.write(f)
        writer.release()
        
        return output_path

    def _merge_audio(self, segment: SegmentSpec, out_path: Path):
        import subprocess
        inputs = []
        for ev in segment.events:
            ev_audio = out_path.parent / "audio" / f"{ev.event_id}.wav"
            if ev_audio.exists():
                inputs.append(ev_audio)
        
        if not inputs:
            from src.utils.ffmpeg import make_silence_wav
            make_silence_wav(out_path, segment.duration_s)
            return

        list_path = out_path.with_suffix('.txt')
        with open(list_path, 'w') as f:
            for p in inputs:
                f.write(f"file '{p.resolve()}'\n")
                
        cmd = ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(list_path), '-c', 'copy', str(out_path)]
        subprocess.run(cmd, check=True)
        list_path.unlink()