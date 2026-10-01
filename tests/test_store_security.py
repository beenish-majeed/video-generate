import io
import pytest
from pathlib import Path
from fastapi import HTTPException, UploadFile

from src.services.store import (
    get_asset_path,
    save_upload,
    validate_upload,
    ASSETS_DIR,
)


def test_get_asset_path_exact_matching(tmp_path, monkeypatch):
    monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)
    
    file1 = tmp_path / "photo_12345.png"
    file1.write_text("dummy photo 1")
    
    file2 = tmp_path / "photo_123456789.png"
    file2.write_text("dummy photo 2")
    
    # Exact match should return exact file, not prefix match
    assert get_asset_path("photo_12345") == file1
    assert get_asset_path("photo_123456789") == file2
    
    # Prefix match attempt must return None
    assert get_asset_path("photo") is None
    assert get_asset_path("photo_12") is None


def test_upload_validation_invalid_extension():
    fake_file = UploadFile(filename="malicious.exe", file=io.BytesIO(b"fake binary"))
    with pytest.raises(HTTPException) as exc_info:
        validate_upload(fake_file, kind="photo")
    assert exc_info.value.status_code == 400
    assert "Invalid photo extension" in exc_info.value.detail


def test_upload_validation_empty_file():
    fake_file = UploadFile(filename="empty.png", file=io.BytesIO(b""))
    with pytest.raises(HTTPException) as exc_info:
        validate_upload(fake_file, kind="photo")
    assert exc_info.value.status_code == 400
    assert "empty" in exc_info.value.detail.lower()
