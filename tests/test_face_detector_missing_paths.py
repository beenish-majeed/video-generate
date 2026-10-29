from pathlib import Path
from PIL import Image
from src.services.face_detector import (
    count_faces_in_image,
    evaluate_visual_mode,
    set_face_count_override,
    clear_face_count_overrides,
)


def test_count_faces_none_and_nonexistent(tmp_path):
    clear_face_count_overrides()
    # None should return 0 safely
    assert count_faces_in_image(None) == 0

    # Non-existent path should return 0 safely
    missing = tmp_path / "does_not_exist.jpg"
    assert count_faces_in_image(missing) == 0


def test_evaluate_visual_mode_with_none_or_missing(tmp_path):
    clear_face_count_overrides()

    # Empty or all None/missing paths
    mode, reason, face_p = evaluate_visual_mode([None, tmp_path / "missing.jpg"], prefer_lip_sync=True)
    assert mode == "slideshow"
    assert face_p is None
    assert "no images provided" in reason

    # List with None plus a valid image with 1 face
    valid_img = tmp_path / "person.jpg"
    Image.new("RGB", (100, 100), color="white").save(valid_img)
    set_face_count_override(valid_img.name, 1)

    try:
        mode, reason, face_p = evaluate_visual_mode([None, valid_img], prefer_lip_sync=True)
        assert mode == "talking_head"
        assert face_p == valid_img
    finally:
        clear_face_count_overrides()
