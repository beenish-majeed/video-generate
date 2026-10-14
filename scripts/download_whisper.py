"""
Download faster-whisper model weights for offline speech recognition.

Usage:
    python scripts/download_whisper.py [--model-size tiny] [--target-dir models/whisper/tiny]

Downloads the open-source faster-whisper model once so audio transcription
runs 100% locally and offline without outbound internet connections at runtime.
"""

import argparse
import sys
from pathlib import Path


def download_whisper_model(model_size: str, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    marker = target_dir / "model.bin"
    if marker.exists():
        print(f"[OK] Whisper model ({model_size}) already downloaded at: {target_dir}")
        return

    print(f"Downloading faster-whisper '{model_size}' model into {target_dir}...")
    try:
        from faster_whisper import download_model
    except ImportError:
        print("[Error] 'faster-whisper' package is not installed. Please install it with 'pip install faster-whisper'.")
        sys.exit(1)

    try:
        download_model(model_size, output_dir=str(target_dir))
        print(f"[Success] Whisper model ({model_size}) downloaded successfully to {target_dir}")
    except Exception as exc:
        print(f"[Error] Failed to download Whisper model: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download faster-whisper model weights for offline auto-subtitles.")
    parser.add_argument(
        "--model-size",
        type=str,
        default="tiny",
        help="Whisper model size: tiny, base, small (default: tiny)",
    )
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=Path("models/whisper/tiny"),
        help="Target folder to save model weights (default: models/whisper/tiny)",
    )
    args = parser.parse_args()
    download_whisper_model(args.model_size, args.target_dir)
