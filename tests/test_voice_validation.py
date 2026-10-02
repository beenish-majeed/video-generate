import io
import struct
import wave
import pytest
from fastapi import HTTPException, UploadFile
from src.services.store import validate_upload


def test_fake_wav_file_rejected():
    fake_audio = UploadFile(
        filename="fake_voice.wav",
        file=io.BytesIO(b"This is just plain text content renamed to fake_voice.wav"),
    )
    with pytest.raises(HTTPException) as exc_info:
        validate_upload(fake_audio, kind="voice")
    assert exc_info.value.status_code == 400
    assert "Invalid audio file format or corrupt audio" in exc_info.value.detail


def test_corrupt_wav_file_rejected():
    corrupt_bytes = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00corrupt_data_garbage"
    corrupt_audio = UploadFile(
        filename="corrupt_voice.wav",
        file=io.BytesIO(corrupt_bytes),
    )
    with pytest.raises(HTTPException) as exc_info:
        validate_upload(corrupt_audio, kind="voice")
    assert exc_info.value.status_code == 400
    assert "Invalid audio file format or corrupt audio" in exc_info.value.detail


def test_valid_wav_file_accepted():
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(22050)
        # 1 second tone
        data = b"".join(struct.pack("<h", int(4000 * (i % 2))) for i in range(22050))
        wf.writeframes(data)
    buf.seek(0)

    valid_audio = UploadFile(filename="valid_voice.wav", file=buf)
    # Should not raise exception
    validate_upload(valid_audio, kind="voice")
