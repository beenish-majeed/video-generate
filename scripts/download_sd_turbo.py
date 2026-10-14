"""
Download SD-Turbo model weights for offline diffusers inference.

Usage:
    python scripts/download_sd_turbo.py [--target-dir models/sd-turbo]

SD-Turbo is a single-step to four-step distilled text-to-image model by Stability AI.
Weights are downloaded once into `models/sd-turbo` so inference at runtime is
100% offline and requires no outbound internet connection.
"""

import argparse
import sys
from pathlib import Path


def download_sd_turbo(target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    marker = target_dir / "model_index.json"
    if marker.exists():
        print(f"[OK] SD-Turbo already downloaded at: {target_dir}")
        return

    print(f"Downloading SD-Turbo weights from Hugging Face into {target_dir}...")
    try:
        from diffusers import AutoPipelineForText2Image
        import torch
    except ImportError as exc:
        print(f"[Error] Required libraries missing: {exc}. Please install diffusers and torch.")
        sys.exit(1)

    try:
        pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sd-turbo",
            torch_dtype=torch.float32,
            variant="fp16",
        )
        pipe.save_pretrained(target_dir)
        print(f"[Success] SD-Turbo weights saved successfully to {target_dir}")
    except Exception as exc:
        print(f"[Error] Failed to download SD-Turbo: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download SD-Turbo model weights for offline text-to-image.")
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=Path("models/sd-turbo"),
        help="Target folder to save SD-Turbo weights (default: models/sd-turbo)",
    )
    args = parser.parse_args()
    download_sd_turbo(args.target_dir)
