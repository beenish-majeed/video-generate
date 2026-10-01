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

from src.config import settings
from src.models.schemas import CompiledPlan, SegmentSpec

# Add Wav2Lip repo to path so we can import its modules
wav2lip_repo = settings.wav2lip_repo_path
if wav2lip_repo not in sys.path:
    sys.path.insert(0, wav2lip_repo)

try:
    from models import Wav2Lip as Wav2LipModel
except ImportError:
    raise ImportError("Cannot import Wav2Lip model. Did you clone the repo to ./external/wav2lip?")


class RealWav2LipProvider:
    name = "wav2lip_pytorch"
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Loading Wav2Lip model on device: {self.device}...")
        
        ckpt_path = Path(settings.wav2lip_ckpt_path)
        if not ckpt_path.exists():
             raise FileNotFoundError(f"Wav2Lip checkpoint not found at {ckpt_path}")

        self.model = Wav2LipModel()
        checkpoint = torch.load(str(ckpt_path), map_location=self.device)

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
        self._initialized = True
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
        ref_img_path = identity_pack.get("canonical_reference_image") or identity_pack.get("source_photo_path")
        img = cv2.imread(str(ref_img_path))
        if img is None:
            raise ValueError(f"Reference image missing or unreadable: {ref_img_path}")
            
        # 2. Merge Audio for this segment
        temp_audio = job_path / f"{segment.segment_id}_merged.wav"
        self._merge_audio(segment, temp_audio)
        
        # 3. Process Frames & Mel Spectrogram
        fps = plan.video.fps
        sr = 16000  # Wav2Lip standard sample rate
        mel_step_size = 16

        # Load Audio via librosa or fallback wave
        try:
            y, _ = librosa.load(str(temp_audio), sr=sr, mono=True)
        except Exception:
            import wave
            with wave.open(str(temp_audio), "rb") as wf:
                raw = wf.readframes(wf.getnframes())
                y = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

        if len(y) == 0:
            y = np.zeros(int(segment.duration_s * sr), dtype=np.float32)

        # Compute Mel Spectrogram according to Wav2Lip spec
        n_fft = 800
        hop_length = 200
        win_length = 800
        n_mels = 80

        mel = librosa.feature.melspectrogram(
            y=y, sr=sr, n_fft=n_fft, hop_length=hop_length, win_length=win_length, n_mels=n_mels
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        mel_db = (mel_db + 4.0) / 4.0

        # Construct 16-frame mel window chunks
        mel_chunks = []
        mel_idx_multiplier = 80.0 / fps
        num_frames = max(1, int(round(segment.duration_s * fps)))
        i = 0

        while True:
            start_idx = int(i * mel_idx_multiplier)
            if start_idx + mel_step_size > mel_db.shape[1]:
                if mel_db.shape[1] >= mel_step_size:
                    mel_chunks.append(mel_db[:, mel_db.shape[1] - mel_step_size:])
                else:
                    pad_len = mel_step_size - mel_db.shape[1]
                    padded = np.pad(mel_db, ((0, 0), (0, pad_len)), mode="edge")
                    mel_chunks.append(padded)
                break
            mel_chunks.append(mel_db[:, start_idx : start_idx + mel_step_size])
            i += 1

        if len(mel_chunks) < num_frames:
            last = mel_chunks[-1] if mel_chunks else np.zeros((80, 16), dtype=np.float32)
            while len(mel_chunks) < num_frames:
                mel_chunks.append(last)
        elif len(mel_chunks) > num_frames:
            mel_chunks = mel_chunks[:num_frames]

        num_frames = len(mel_chunks)

        # 4. Prepare Bounding Box & 6-channel Input Images
        bbox = identity_pack.get("bbox")
        if bbox and len(bbox) == 4:
            x1, y1, x2, y2 = [int(v) for v in bbox]
            x1 = max(0, min(img.shape[1] - 1, x1))
            y1 = max(0, min(img.shape[0] - 1, y1))
            x2 = max(x1 + 10, min(img.shape[1], x2))
            y2 = max(y1 + 10, min(img.shape[0], y2))
        else:
            x1, y1, x2, y2 = 0, 0, img.shape[1], img.shape[0]

        face_crop = img[y1:y2, x1:x2]
        face_resized = cv2.resize(face_crop, (96, 96))
        face_rgb = cv2.cvtColor(face_resized, cv2.COLOR_BGR2RGB)

        # Mask lower half of target face (mouth region)
        face_masked = face_rgb.copy()
        face_masked[48:, :] = 0

        # Concatenate along channel axis -> 6 channels (masked face + reference face)
        input_6ch = np.concatenate((face_masked, face_rgb), axis=2).astype(np.float32) / 255.0

        # Batch construction
        batch_size = 8
        generated_faces = []

        for b_start in range(0, num_frames, batch_size):
            b_end = min(b_start + batch_size, num_frames)
            current_b_len = b_end - b_start

            # Batch images shape: (B, 96, 96, 6) -> transpose to (B, 6, 96, 96)
            b_imgs = np.stack([input_6ch] * current_b_len, axis=0)
            b_imgs_tensor = torch.FloatTensor(b_imgs.transpose(0, 3, 1, 2)).to(self.device)

            # Batch mels shape: (B, 80, 16) -> reshape to (B, 1, 80, 16)
            b_mels = np.stack(mel_chunks[b_start:b_end], axis=0)
            b_mels = b_mels.reshape(current_b_len, 1, 80, 16)
            b_mels_tensor = torch.FloatTensor(b_mels).to(self.device)

            with torch.no_grad():
                pred = self.model(b_mels_tensor, b_imgs_tensor)

            # Pred shape: (B, 3, 96, 96) -> convert back to RGB numpy (B, 96, 96, 3)
            pred_np = pred.cpu().numpy().transpose(0, 2, 3, 1) * 255.0
            pred_np = np.clip(pred_np, 0, 255).astype(np.uint8)

            for face in pred_np:
                generated_faces.append(face)

        # 5. Paste generated face back into frame & add subtle motion
        final_frames = []
        base_img = img.copy()

        for idx, gen_face_rgb in enumerate(generated_faces):
            frame = base_img.copy()
            orig_w = x2 - x1
            orig_h = y2 - y1

            gen_face_bgr = cv2.cvtColor(gen_face_rgb, cv2.COLOR_RGB2BGR)
            gen_face_resized = cv2.resize(gen_face_bgr, (orig_w, orig_h))

            frame[y1:y2, x1:x2] = gen_face_resized

            # Procedural subtle head motion
            t = idx / fps
            dx = int(1.5 * np.sin(t * 1.5))
            dy = int(1.0 * np.cos(t * 1.2))

            M = np.float32([[1, 0, dx], [0, 1, dy]])
            frame_shifted = cv2.warpAffine(frame, M, (frame.shape[1], frame.shape[0]))
            final_frames.append(frame_shifted)

        # 6. Write Video File
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
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

        list_path = out_path.with_suffix(".txt")
        with open(list_path, "w", encoding="utf-8") as f:
            for p in inputs:
                f.write(f"file '{p.resolve()}'\n")

        cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-c",
            "copy",
            str(out_path),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        if list_path.exists():
            list_path.unlink()