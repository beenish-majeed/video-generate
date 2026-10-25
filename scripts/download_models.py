"""
Offline Models Download and Verification Script for AvatarStudio.

Downloads all local AI models once so the application runs 100% offline and free at runtime:
1. Piper TTS Voice: en_US-lessac-medium (ONNX + JSON config)
2. Wav2Lip Checkpoint: wav2lip.pth
3. SD-Turbo: Diffusers weights for local text-to-image (optional, skips if diffusers not installed)
4. faster-whisper: Tiny model for local auto-subtitles (optional, skips if faster-whisper not installed)

Safe, re-runnable, and reports what is already present.
"""

from pathlib import Path
import sys
import urllib.request
import shutil

from src.utils.model_integrity import verify_model_file

PIPER_MODEL_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
PIPER_CONFIG_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
WAV2LIP_CKPT_URL = "https://huggingface.co/camenduru/Wav2Lip/resolve/main/wav2lip.pth"


def download_file(url: str, dest: Path, desc: str) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        is_valid, computed_hash, expected_hash = verify_model_file(dest)
        if expected_hash:
            if is_valid:
                print(f"  [OK] {desc} already present and verified (SHA-256 match): {dest} ({dest.stat().st_size / (1024*1024):.1f} MB)")
                return True
            else:
                print(f"  [SECURITY WARNING] Existing {desc} failed integrity check! Expected {expected_hash}, got {computed_hash}. Deleting corrupted file...")
                dest.unlink()
        else:
            print(f"  [OK] {desc} already present: {dest} ({dest.stat().st_size / (1024*1024):.1f} MB)")
            return True

    print(f"  Downloading {desc} from {url}...")
    temp_path = dest.with_suffix(dest.suffix + ".part")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AvatarStudioSetup/1.0"})
        with urllib.request.urlopen(req) as resp, open(temp_path, "wb") as out_file:
            shutil.copyfileobj(resp, out_file)

        is_valid, computed_hash, expected_hash = verify_model_file(temp_path, expected_name=dest.name)
        if expected_hash and not is_valid:
            if temp_path.exists():
                temp_path.unlink()
            print(f"  [SECURITY ABORT] Downloaded {desc} failed integrity check! Expected {expected_hash}, got {computed_hash}. Aborting setup.")
            sys.exit(1)

        temp_path.rename(dest)
        print(f"  [OK] Successfully saved and verified {desc} to {dest} ({dest.stat().st_size / (1024*1024):.1f} MB)")
        return True
    except SystemExit:
        raise
    except Exception as exc:
        if temp_path.exists():
            temp_path.unlink()
        print(f"  [Warning] Could not download {desc}: {exc}")
        return False


def setup_piper() -> bool:
    print("\n[1/4] Checking Piper TTS Voice Model...")
    model_path = Path("src/models/piper/en_US-lessac-medium.onnx")
    config_path = Path("src/models/piper/en_US-lessac-medium.onnx.json")

    ok_model = download_file(PIPER_MODEL_URL, model_path, "Piper Lessac ONNX model")
    ok_cfg = download_file(PIPER_CONFIG_URL, config_path, "Piper Lessac JSON config")
    return ok_model and ok_cfg


def setup_wav2lip() -> bool:
    print("\n[2/4] Checking Wav2Lip Checkpoint...")
    ckpt_path = Path("src/models/wav2lip/wav2lip.pth")
    return download_file(WAV2LIP_CKPT_URL, ckpt_path, "Wav2Lip checkpoint")


def setup_sd_turbo() -> bool:
    print("\n[3/4] Checking SD-Turbo Text-to-Image Model...")
    target_dir = Path("models/sd-turbo")
    marker = target_dir / "model_index.json"
    if marker.exists():
        print(f"  [OK] SD-Turbo already downloaded at: {target_dir}")
        return True

    try:
        from scripts.download_sd_turbo import download_sd_turbo
        download_sd_turbo(target_dir)
        return True
    except ImportError:
        print("  [Note] 'diffusers' library not installed. Procedural title cards will be used.")
        return False
    except Exception as exc:
        print(f"  [Note] SD-Turbo download skipped: {exc}. Procedural title cards will be used.")
        return False


def setup_whisper() -> bool:
    print("\n[4/4] Checking faster-whisper Speech-to-Text Model...")
    target_dir = Path("models/whisper/tiny")
    marker = target_dir / "model.bin"
    if marker.exists() or any(target_dir.glob("*.bin")) or any(target_dir.glob("*.safetensors")):
        print(f"  [OK] faster-whisper (tiny) already downloaded at: {target_dir}")
        return True

    try:
        from scripts.download_whisper import download_whisper_model
        download_whisper_model("tiny", target_dir)
        return True
    except ImportError:
        print("  [Note] 'faster-whisper' library not installed. Procedural subtitle timing will be used.")
        return False
    except Exception as exc:
        print(f"  [Note] faster-whisper download skipped: {exc}. Procedural subtitle timing will be used.")
        return False


def main():
    print("=" * 60)
    print("AvatarStudio Model Setup & Offline Verification")
    print("=" * 60)

    p_ok = setup_piper()
    w_ok = setup_wav2lip()
    s_ok = setup_sd_turbo()
    wh_ok = setup_whisper()

    print("\n" + "=" * 60)
    print("Model Setup Summary:")
    print(f"  Piper Voice (offline TTS):      {'[READY]' if p_ok else '[MISSING]'}")
    print(f"  Wav2Lip (talking-head):         {'[READY]' if w_ok else '[MISSING]'}")
    print(f"  SD-Turbo (neural visuals):      {'[READY]' if s_ok else '[OPTIONAL - cards fallback]'}")
    print(f"  faster-whisper (auto-subtitles):{'[READY]' if wh_ok else '[OPTIONAL - aligner fallback]'}")
    print("=" * 60)


if __name__ == "__main__":
    main()
