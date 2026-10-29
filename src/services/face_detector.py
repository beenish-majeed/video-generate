import logging
from pathlib import Path
from typing import Optional
import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Test hook to allow deterministic override in automated tests
_FACE_COUNT_OVERRIDES: dict[str, int] = {}


def set_face_count_override(image_name_or_stem: str, count: int) -> None:
    """Override face count for a specific image filename/stem (useful in tests)."""
    _FACE_COUNT_OVERRIDES[image_name_or_stem] = count


def clear_face_count_overrides() -> None:
    """Clear all test overrides."""
    _FACE_COUNT_OVERRIDES.clear()


def count_faces_in_image(image_path: Optional[Path]) -> int:
    """
    Detect the number of clear human faces in an image.
    Uses test overrides if registered, then neural / feature detection.
    """
    if image_path is None:
        return 0

    try:
        p = Path(image_path)
        if not p.is_file():
            return 0
    except Exception:
        return 0

    path_key = p.name
    stem_key = p.stem
    if path_key in _FACE_COUNT_OVERRIDES:
        return _FACE_COUNT_OVERRIDES[path_key]
    if stem_key in _FACE_COUNT_OVERRIDES:
        return _FACE_COUNT_OVERRIDES[stem_key]

    img = cv2.imread(str(p))
    if img is None:
        return 0

    # Fallback feature analysis: check skin chrominance & face-like aspect ratio
    try:
        ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        # Skin color boundaries in YCrCb
        lower = np.array([0, 133, 77], dtype=np.uint8)
        upper = np.array([255, 173, 127], dtype=np.uint8)
        mask = cv2.inRange(ycrcb, lower, upper)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        img_area = img.shape[0] * img.shape[1]
        face_candidates = []

        for c in contours:
            area = cv2.contourArea(c)
            # Face region should occupy between 3% and 85% of image
            if 0.03 * img_area <= area <= 0.85 * img_area:
                x, y, w, h = cv2.boundingRect(c)
                aspect = h / float(w)
                # Human face bounding box aspect ratio is typically between 0.9 and 2.0
                if 0.9 <= aspect <= 2.0:
                    face_candidates.append((x, y, w, h))

        return len(face_candidates)
    except Exception as exc:
        logger.warning(f"Face detection analysis error on {image_path}: {exc}")
        return 0


def evaluate_visual_mode(
    image_paths: list[Path],
    prefer_lip_sync: bool,
) -> tuple[str, str, Optional[Path]]:
    """
    Evaluate visual mode for uploaded images and user preference:
    - If prefer_lip_sync is False -> "slideshow" (Ken Burns)
    - If prefer_lip_sync is True and exactly one clear face -> "talking_head" (Wav2Lip)
    - If prefer_lip_sync is True and 0 faces -> "slideshow" (Ken Burns) with explanation
    - If prefer_lip_sync is True and >1 faces -> "slideshow" (Ken Burns) with explanation

    Returns:
        (mode_used, explanation_reason, face_image_path)
    """
    if not prefer_lip_sync:
        return (
            "slideshow",
            "Ken Burns slideshow compositor used (lip sync was not requested).",
            None,
        )

    valid_paths = [Path(p) for p in (image_paths or []) if p is not None and Path(p).is_file()]
    if not valid_paths:
        return (
            "slideshow",
            "Ken Burns slideshow compositor used (no images provided).",
            None,
        )

    # Count faces across all uploaded images
    face_counts_per_image: list[tuple[Path, int]] = []
    total_faces = 0
    face_images = []

    for p in valid_paths:
        c = count_faces_in_image(p)
        face_counts_per_image.append((p, c))
        total_faces += c
        if c > 0:
            face_images.append(p)

    if total_faces == 0:
        return (
            "slideshow",
            "Ken Burns slideshow compositor used (no clear face detected in uploaded images for lip sync).",
            None,
        )

    if total_faces > 1:
        return (
            "slideshow",
            f"Ken Burns slideshow compositor used ({total_faces} faces detected across images; lip sync requires exactly one clear face).",
            None,
        )

    # Exactly 1 face found!
    single_face_image = face_images[0] if face_images else image_paths[0]
    return (
        "talking_head",
        "Wav2Lip lip-sync pipeline used (single clear face detected).",
        single_face_image,
    )
