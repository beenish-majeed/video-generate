"""
Colab helper utilities for local AI clip generation workflow.
This module is designed to run in Google Colab (CPU or GPU) or local Python environments
without external network calls or proprietary API dependencies.
"""

import json
from pathlib import Path
from typing import Any, Union
import zipfile


def load_scene_plan(source: Union[str, Path, dict]) -> dict[str, Any]:
    """
    Load and validate a scene_plan JSON file or dictionary exported from Avatar Pipeline.
    """
    if isinstance(source, (str, Path)):
        p = Path(source)
        if not p.exists():
            raise FileNotFoundError(f"Scene plan file not found at: {p}")
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
    elif isinstance(source, dict):
        data = source
    else:
        raise ValueError(f"Expected file path or dict, got {type(source).__name__}. Scene plan root must be a JSON object.")

    if not isinstance(data, dict):
        raise ValueError("Scene plan root must be a JSON object.")

    scenes = data.get("scenes")
    if not isinstance(scenes, list):
        raise ValueError("Scene plan must contain a 'scenes' list.")

    for idx, sc in enumerate(scenes):
        if not isinstance(sc, dict):
            raise ValueError(f"Scene entry at index {idx} must be a dictionary.")
        if "id" not in sc:
            sc["id"] = f"scene_{idx + 1:03d}"
        if "visual_prompt" not in sc or not str(sc["visual_prompt"]).strip():
            raise ValueError(f"Scene {sc.get('id', idx)} is missing a non-empty 'visual_prompt'.")
        if "target_clip_seconds" not in sc:
            sc["target_clip_seconds"] = 5.0
        else:
            try:
                sc["target_clip_seconds"] = float(sc["target_clip_seconds"])
            except (ValueError, TypeError) as exc:
                raise ValueError(f"Scene {sc['id']} has invalid target_clip_seconds.") from exc

    return data


def get_scene_filename(scene_item: Union[dict[str, Any], int, str]) -> str:
    """
    Standardize clip output filename (e.g. scene_001.mp4).
    """
    if isinstance(scene_item, dict):
        raw_id = scene_item.get("id") or f"scene_{scene_item.get('scene_index', 0) + 1:03d}"
    elif isinstance(scene_item, int):
        raw_id = f"scene_{scene_item + 1:03d}"
    else:
        raw_id = str(scene_item)

    clean_stem = Path(raw_id).stem.lower().strip()
    if clean_stem.startswith("scene_"):
        try:
            num = int(clean_stem.replace("scene_", ""))
            return f"scene_{num:03d}.mp4"
        except ValueError:
            pass
    return f"{clean_stem}.mp4"


def derive_scene_seed(base_seed: int, scene_index: int) -> int:
    """
    Derive a deterministic integer seed per scene.
    """
    return (int(base_seed) + (int(scene_index) * 10007)) % 2147483647


def filter_pending_scenes(
    scenes: list[dict[str, Any]],
    output_dir: Union[str, Path],
    overwrite: bool = False,
) -> list[dict[str, Any]]:
    """
    Filter scene list for resume support: skips scenes that already have a non-empty output clip.
    """
    out_dir = Path(output_dir)
    if not out_dir.exists():
        return list(scenes)

    if overwrite:
        return list(scenes)

    pending = []
    for sc in scenes:
        fname = get_scene_filename(sc)
        clip_path = out_dir / fname
        if clip_path.exists() and clip_path.is_file() and clip_path.stat().st_size > 1024:
            # File exists and is non-empty; skip to allow resuming
            continue
        pending.append(sc)
    return pending


def validate_clip_file(file_path: Union[str, Path]) -> bool:
    """
    Validate that an exported video clip file exists and is a non-empty mp4.
    """
    p = Path(file_path)
    if not p.is_file():
        return False
    if p.suffix.lower() != ".mp4":
        return False
    return p.stat().st_size > 1024


def create_clips_zip(
    clips_dir: Union[str, Path],
    output_zip: Union[str, Path],
    scene_ids: Union[list[str], None] = None,
) -> Path:
    """
    Archive all generated scene clips into a single clean ZIP file ready for web app upload.
    """
    in_dir = Path(clips_dir)
    out_zip = Path(output_zip)
    out_zip.parent.mkdir(parents=True, exist_ok=True)

    clip_files: list[Path] = []
    if scene_ids:
        for sid in scene_ids:
            expected = in_dir / get_scene_filename(sid)
            if expected.is_file() and expected.stat().st_size > 0:
                clip_files.append(expected)
    else:
        clip_files = sorted(in_dir.glob("scene_*.mp4"))

    if not clip_files:
        raise FileNotFoundError(f"No valid MP4 scene clips found in {in_dir} to package.")

    with zipfile.ZipFile(out_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for clip in clip_files:
            zf.write(clip, arcname=clip.name)

    return out_zip
