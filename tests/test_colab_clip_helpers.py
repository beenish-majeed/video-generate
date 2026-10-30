import json
from pathlib import Path
import zipfile
import pytest

from notebooks.clip_helpers import (
    create_clips_zip,
    derive_scene_seed,
    filter_pending_scenes,
    get_scene_filename,
    load_scene_plan,
    validate_clip_file,
)


class TestColabNotebookValidation:
    def test_notebook_json_and_nbformat_validity(self):
        nb_path = Path("notebooks") / "ai_clips_colab.ipynb"
        assert nb_path.exists(), "Notebook file missing."

        with open(nb_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data.get("nbformat") == 4
        assert "cells" in data and isinstance(data["cells"], list)
        assert len(data["cells"]) >= 8

        all_sources = "".join("".join(c.get("source", [])) for c in data["cells"])

        # Validate core components are present in notebook
        assert "!nvidia-smi" in all_sources
        assert "Lightricks/LTX-Video" in all_sources
        assert "Wan2.1" in all_sources
        assert "filter_pending_scenes" in all_sources
        assert "create_clips_zip" in all_sources
        assert "Test One Clip First" in all_sources


class TestClipHelpers:
    def test_load_scene_plan_valid_dict(self):
        valid_dict = {
            "plan_id": "plan_12345",
            "style": "cinematic",
            "total_duration_seconds": 15.0,
            "scenes": [
                {
                    "id": "scene_001",
                    "scene_index": 0,
                    "visual_prompt": "A quiet pine forest in mist",
                    "negative_prompt": "blurry",
                    "target_clip_seconds": 6.5,
                },
                {
                    "id": "scene_002",
                    "scene_index": 1,
                    "visual_prompt": "A mountain stream",
                    "negative_prompt": "blurry",
                    "target_clip_seconds": 8.5,
                },
            ],
        }
        res = load_scene_plan(valid_dict)
        assert res["plan_id"] == "plan_12345"
        assert len(res["scenes"]) == 2

    def test_load_scene_plan_from_file(self, tmp_path):
        plan_file = tmp_path / "scene_plan.json"
        plan_data = {
            "plan_id": "test_plan",
            "scenes": [
                {"id": "scene_001", "visual_prompt": "A red barn at sunset", "target_clip_seconds": 5.0}
            ],
        }
        plan_file.write_text(json.dumps(plan_data), encoding="utf-8")

        res = load_scene_plan(plan_file)
        assert res["plan_id"] == "test_plan"
        assert len(res["scenes"]) == 1

    def test_load_scene_plan_missing_file_raises(self, tmp_path):
        missing = tmp_path / "does_not_exist.json"
        with pytest.raises(FileNotFoundError):
            load_scene_plan(missing)

    def test_load_scene_plan_invalid_root_type(self):
        with pytest.raises(ValueError, match="JSON object"):
            load_scene_plan([1, 2, 3])  # type: ignore

    def test_load_scene_plan_missing_scenes_list(self):
        with pytest.raises(ValueError, match="'scenes' list"):
            load_scene_plan({"plan_id": "plan_1"})

    def test_load_scene_plan_empty_visual_prompt_raises(self):
        bad_plan = {
            "scenes": [{"id": "scene_001", "visual_prompt": "   "}]
        }
        with pytest.raises(ValueError, match="missing a non-empty 'visual_prompt'"):
            load_scene_plan(bad_plan)

    def test_get_scene_filename(self):
        assert get_scene_filename({"id": "scene_001"}) == "scene_001.mp4"
        assert get_scene_filename(0) == "scene_001.mp4"
        assert get_scene_filename(4) == "scene_005.mp4"
        assert get_scene_filename("scene_042") == "scene_042.mp4"

    def test_derive_scene_seed(self):
        s0 = derive_scene_seed(base_seed=42, scene_index=0)
        s1 = derive_scene_seed(base_seed=42, scene_index=1)
        s2 = derive_scene_seed(base_seed=42, scene_index=2)
        assert s0 != s1
        assert s1 != s2
        # Deterministic
        assert s0 == derive_scene_seed(base_seed=42, scene_index=0)

    def test_filter_pending_scenes_resume(self, tmp_path):
        scenes = [
            {"id": "scene_001", "visual_prompt": "Scene one"},
            {"id": "scene_002", "visual_prompt": "Scene two"},
            {"id": "scene_003", "visual_prompt": "Scene three"},
        ]

        # Simulate scene_001.mp4 already existing and rendered (>1024 bytes)
        clip1 = tmp_path / "scene_001.mp4"
        clip1.write_bytes(b"x" * 2048)

        # scene_002 is partial or 0 bytes
        clip2 = tmp_path / "scene_002.mp4"
        clip2.write_bytes(b"small")

        pending = filter_pending_scenes(scenes, output_dir=tmp_path, overwrite=False)
        # scene_001 skipped, scene_002 and scene_003 remain
        assert len(pending) == 2
        assert [s["id"] for s in pending] == ["scene_002", "scene_003"]

        # With overwrite=True, all scenes are returned
        all_pending = filter_pending_scenes(scenes, output_dir=tmp_path, overwrite=True)
        assert len(all_pending) == 3

    def test_validate_clip_file(self, tmp_path):
        valid = tmp_path / "scene_001.mp4"
        valid.write_bytes(b"v" * 2000)
        assert validate_clip_file(valid) is True

        tiny = tmp_path / "tiny.mp4"
        tiny.write_bytes(b"short")
        assert validate_clip_file(tiny) is False

        wrong_ext = tmp_path / "scene_001.avi"
        wrong_ext.write_bytes(b"v" * 2000)
        assert validate_clip_file(wrong_ext) is False

    def test_create_clips_zip(self, tmp_path):
        clips_dir = tmp_path / "clips"
        clips_dir.mkdir(parents=True, exist_ok=True)

        c1 = clips_dir / "scene_001.mp4"
        c1.write_bytes(b"clip 1 data" * 200)
        c2 = clips_dir / "scene_002.mp4"
        c2.write_bytes(b"clip 2 data" * 200)

        out_zip = tmp_path / "output.zip"
        res = create_clips_zip(clips_dir, out_zip)
        assert res.exists()
        assert res.stat().st_size > 0

        with zipfile.ZipFile(res, "r") as zf:
            names = sorted(zf.namelist())
            assert names == ["scene_001.mp4", "scene_002.mp4"]

    def test_create_clips_zip_empty_raises(self, tmp_path):
        empty_dir = tmp_path / "empty_clips"
        empty_dir.mkdir(parents=True, exist_ok=True)
        out_zip = tmp_path / "output.zip"
        with pytest.raises(FileNotFoundError):
            create_clips_zip(empty_dir, out_zip)
