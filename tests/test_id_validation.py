import io
from PIL import Image
from fastapi import UploadFile
import pytest

from src.models.schemas import (
    ConsentRequest,
    JobCreate,
    is_valid_asset_id,
    is_valid_job_id,
)
from src.services.jobs import create_job
from src.services.store import save_upload


def test_new_job_id_is_32_hex_chars():
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this video generation and own all explicit rights.",
        face_rights_attested=True,
        voice_rights_attested=True,
        ai_generated_accepted=True,
        ai_label_accepted=True,
    )
    req = JobCreate(
        avatar_preset_id="avatar_default",
        voice_preset_id="voice_piper_lessac",
        prompt="5 second video",
        consent=consent,
    )
    job = create_job(req)
    assert job.job_id.startswith("job_")
    # job_ + 32 hex characters = 36 total length
    hex_part = job.job_id.replace("job_", "")
    assert len(hex_part) == 32
    assert is_valid_job_id(job.job_id)


def test_new_asset_id_is_32_hex_chars(tmp_path, monkeypatch):
    monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)
    img = Image.new("RGB", (64, 64), (10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    upload = UploadFile(file=buf, filename="sample.png")
    saved = save_upload(upload, kind="photo")
    asset_id = saved["asset_id"]

    assert asset_id.startswith("photo_")
    hex_part = asset_id.replace("photo_", "")
    assert len(hex_part) == 32
    assert is_valid_asset_id(asset_id)


def test_legacy_12_hex_ids_still_accepted():
    legacy_job = "job_123456abcdef"
    assert len(legacy_job.replace("job_", "")) == 12
    assert is_valid_job_id(legacy_job)

    for kind in ["photo", "voice", "image", "audio", "music"]:
        legacy_asset = f"{kind}_123456abcdef"
        assert is_valid_asset_id(legacy_asset)


def test_invalid_traversal_ids_rejected():
    assert not is_valid_job_id("../../../etc/passwd")
    assert not is_valid_job_id("job_../../secret")
    assert not is_valid_asset_id("photo/../malicious")
    assert not is_valid_job_id(None)
    assert not is_valid_asset_id("")
