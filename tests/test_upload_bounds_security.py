import io
import struct
import wave
from fastapi import HTTPException, UploadFile
from PIL import Image
import pytest

from src.config import settings
from src.services.store import validate_upload


def make_wav_header_with_duration(duration_seconds: float, sr: int = 8000) -> bytes:
    bytes_per_sample = 2
    byte_rate = sr * bytes_per_sample
    data_size = int(duration_seconds * byte_rate)
    riff_size = 36 + data_size
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        riff_size,
        b"WAVE",
        b"fmt ",
        16,
        1,  # PCM
        1,  # 1 channel
        sr,
        byte_rate,
        bytes_per_sample,
        16,  # 16-bit
        b"data",
        data_size,
    )
    return header + (b"\x00\x00" * 500)


def test_audio_upload_rejects_overlong_duration():
    """Verify that a 1-hour (3600s) audio file is rejected even if small in bytes."""
    data = make_wav_header_with_duration(duration_seconds=3600.0, sr=8000)
    buffer = io.BytesIO(data)
    upload_file = UploadFile(file=buffer, filename="long_voice.wav")

    with pytest.raises(HTTPException) as exc_info:
        validate_upload(upload_file, kind="voice")

    assert exc_info.value.status_code == 400
    assert "exceeds maximum allowed" in str(exc_info.value.detail)


def test_image_upload_rejects_huge_dimensions_without_ram_spike():
    """Verify that a 20000x20000 PNG is rejected before full decompression."""
    img = Image.new("1", (20000, 20000), 1)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    buf.seek(0)

    upload_file = UploadFile(file=buf, filename="huge_bomb.png")

    with pytest.raises(HTTPException) as exc_info:
        validate_upload(upload_file, kind="photo")

    assert exc_info.value.status_code == 400
    assert "exceed" in str(exc_info.value.detail).lower()


def test_image_upload_rejects_dimensions_above_4096():
    """Verify that an image exceeding max dimensions (e.g. 5000x100) is rejected."""
    img = Image.new("RGB", (5000, 100), (20, 30, 40))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    upload_file = UploadFile(file=buf, filename="wide_photo.png")

    with pytest.raises(HTTPException) as exc_info:
        validate_upload(upload_file, kind="photo")

    assert exc_info.value.status_code == 400
    assert "exceed" in str(exc_info.value.detail).lower()


def test_image_upload_rejects_animated_gif():
    """Verify that multi-frame animated images are rejected."""
    buf = io.BytesIO()
    frame1 = Image.new("RGB", (100, 100), (255, 0, 0))
    frame2 = Image.new("RGB", (100, 100), (0, 255, 0))
    frame1.save(
        buf,
        format="GIF",
        save_all=True,
        append_images=[frame2],
        duration=100,
        loop=0,
    )
    buf.seek(0)

    upload_file = UploadFile(file=buf, filename="animated.png")
    with pytest.raises(HTTPException) as exc_info:
        validate_upload(upload_file, kind="photo")
    assert exc_info.value.status_code == 400
    assert "Animated or multi-frame" in str(exc_info.value.detail)


def test_normal_files_pass_validation():
    """Verify that standard sized image and audio pass validation."""
    # Normal image 512x512
    img = Image.new("RGB", (512, 512), (100, 150, 200))
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_buf.seek(0)
    upload_img = UploadFile(file=img_buf, filename="normal.png")
    validate_upload(upload_img, kind="photo")

    # Normal voice 5.0 seconds
    sr = 16000
    n_frames = int(sr * 5.0)
    audio_buf = io.BytesIO()
    with wave.open(audio_buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(b"\x00\x00" * n_frames)
    audio_buf.seek(0)
    upload_voice = UploadFile(file=audio_buf, filename="normal.wav")
    validate_upload(upload_voice, kind="voice")
