import io
import pytest
from PIL import Image
from fastapi import UploadFile, HTTPException

from src.services.store import validate_upload


def test_disguised_bmp_rejected():
    buf = io.BytesIO()
    img = Image.new("RGB", (64, 64), color="blue")
    img.save(buf, format="BMP")
    buf.seek(0)

    # Named with .png extension to disguise BMP
    upload = UploadFile(file=buf, filename="malicious.png")
    with pytest.raises(HTTPException) as exc_info:
        validate_upload(upload, kind="photo")
    assert exc_info.value.status_code == 400
    assert "Disallowed underlying image format 'BMP'" in exc_info.value.detail


def test_extension_mismatch_rejected():
    buf = io.BytesIO()
    img = Image.new("RGB", (64, 64), color="green")
    img.save(buf, format="JPEG")
    buf.seek(0)

    # JPEG disguised as .png
    upload = UploadFile(file=buf, filename="fake.png")
    with pytest.raises(HTTPException) as exc_info:
        validate_upload(upload, kind="photo")
    assert exc_info.value.status_code == 400
    assert "extension '.png' does not match real image codec 'JPEG'" in exc_info.value.detail


def test_genuine_png_and_jpeg_accepted():
    buf_png = io.BytesIO()
    Image.new("RGB", (64, 64), color="red").save(buf_png, format="PNG")
    buf_png.seek(0)
    upload_png = UploadFile(file=buf_png, filename="valid.png")
    validate_upload(upload_png, kind="photo")

    buf_jpg = io.BytesIO()
    Image.new("RGB", (64, 64), color="red").save(buf_jpg, format="JPEG")
    buf_jpg.seek(0)
    upload_jpg = UploadFile(file=buf_jpg, filename="valid.jpg")
    validate_upload(upload_jpg, kind="photo")
