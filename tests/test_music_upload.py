import io
import subprocess
import tempfile
from pathlib import Path
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient

from src.config import settings
from src.main import app
from src.services.store import (
    ASSETS_DIR,
    ALLOWED_MUSIC_EXTS,
    MAX_MUSIC_SIZE_BYTES,
    MIN_MUSIC_DURATION_SECONDS,
    MAX_MUSIC_DURATION_SECONDS,
    get_asset_path,
    save_upload,
    validate_upload,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def auth_setup(monkeypatch):
    monkeypatch.setattr(settings, "api_key", "test_key_music_123")
    monkeypatch.setattr(settings, "allow_insecure_dev", False)


def generate_audio_bytes(ext: str, duration: float = 6.0, freq: int = 440) -> bytes:
    """Generate a real valid audio file using FFmpeg and return bytes."""
    codec_map = {
        ".wav": ("pcm_s16le", []),
        ".mp3": ("libmp3lame", ["-b:a", "128k"]),
        ".ogg": ("libvorbis", ["-qscale:a", "3"]),
        ".flac": ("flac", []),
        ".m4a": ("aac", ["-b:a", "128k"]),
    }
    codec, extra = codec_map.get(ext, ("pcm_s16le", []))
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
        tmp_path = Path(f.name)

    try:
        cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-f", "lavfi",
            "-i", f"sine=frequency={freq}:duration={duration}",
            "-c:a", codec,
            *extra,
            str(tmp_path),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        return tmp_path.read_bytes()
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


class TestMusicUploadDirect:
    @pytest.mark.parametrize("ext", [".mp3", ".wav", ".ogg", ".m4a", ".flac"])
    def test_valid_music_upload_all_formats(self, ext, tmp_path, monkeypatch):
        monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)
        audio_data = generate_audio_bytes(ext=ext, duration=6.0)

        upload = UploadFile(filename=f"track{ext}", file=io.BytesIO(audio_data))
        res = save_upload(upload, kind="music")

        assert res["kind"] == "music"
        assert res["asset_id"].startswith("music_")
        assert "sha256" in res
        assert "duration_seconds" in res
        assert 5.8 <= res["duration_seconds"] <= 6.2

        saved_file = Path(res["path"])
        assert saved_file.exists()
        assert saved_file.suffix == ext

    def test_reject_corrupt_music_file(self):
        corrupt_data = b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"not real audio data at all" * 50
        upload = UploadFile(filename="corrupt.mp3", file=io.BytesIO(corrupt_data))
        with pytest.raises(HTTPException) as exc_info:
            validate_upload(upload, kind="music")
        assert exc_info.value.status_code == 400
        assert "corrupt" in exc_info.value.detail.lower() or "invalid" in exc_info.value.detail.lower()

    def test_reject_invalid_extension(self):
        data = b"some data"
        upload = UploadFile(filename="tune.mp4", file=io.BytesIO(data))
        with pytest.raises(HTTPException) as exc_info:
            validate_upload(upload, kind="music")
        assert exc_info.value.status_code == 400
        assert "Invalid music extension" in exc_info.value.detail

    def test_reject_empty_file(self):
        upload = UploadFile(filename="empty.mp3", file=io.BytesIO(b""))
        with pytest.raises(HTTPException) as exc_info:
            validate_upload(upload, kind="music")
        assert exc_info.value.status_code == 400
        assert "empty" in exc_info.value.detail.lower()

    def test_reject_too_short_duration(self):
        audio_data = generate_audio_bytes(ext=".wav", duration=3.0)
        upload = UploadFile(filename="short.wav", file=io.BytesIO(audio_data))
        with pytest.raises(HTTPException) as exc_info:
            validate_upload(upload, kind="music")
        assert exc_info.value.status_code == 400
        assert "below minimum" in exc_info.value.detail.lower() or "must be between" in exc_info.value.detail.lower()

    def test_reject_too_long_duration(self, monkeypatch):
        audio_data = generate_audio_bytes(ext=".wav", duration=6.0)
        upload = UploadFile(filename="long.wav", file=io.BytesIO(audio_data))
        monkeypatch.setattr("src.services.store._verify_audio_and_get_duration", lambda f, ext: 1205.0)

        with pytest.raises(HTTPException) as exc_info:
            validate_upload(upload, kind="music")
        assert exc_info.value.status_code == 400
        assert "exceeds maximum" in exc_info.value.detail.lower() or "must be between" in exc_info.value.detail.lower()

    def test_reject_oversized_file(self):
        fake_large_stream = io.BytesIO()
        fake_large_stream.write(b"x")
        fake_large_stream.seek(MAX_MUSIC_SIZE_BYTES + 1024)
        fake_large_stream.write(b"x")
        fake_large_stream.seek(0)
        upload = UploadFile(filename="huge.mp3", file=fake_large_stream)

        with pytest.raises(HTTPException) as exc_info:
            validate_upload(upload, kind="music")
        assert exc_info.value.status_code == 400
        assert "exceeds limit" in exc_info.value.detail.lower()


class TestMusicUploadAPI:
    def test_post_upload_music_success(self, tmp_path, monkeypatch):
        monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)
        audio_data = generate_audio_bytes(ext=".wav", duration=7.5)

        response = client.post(
            "/v1/assets/upload",
            headers={"X-API-Key": "test_key_music_123"},
            data={"kind": "music"},
            files={"file": ("soundtrack.wav", audio_data, "audio/wav")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["kind"] == "music"
        assert data["asset_id"].startswith("music_")
        assert "duration_seconds" in data
        assert 7.3 <= data["duration_seconds"] <= 7.7
        assert "sha256" in data

    def test_post_upload_music_rejects_corrupt(self):
        corrupt_bytes = b"RIFF1234WAVEfmt " + b"\x00" * 40
        response = client.post(
            "/v1/assets/upload",
            headers={"X-API-Key": "test_key_music_123"},
            data={"kind": "music"},
            files={"file": ("bad.wav", corrupt_bytes, "audio/wav")},
        )
        assert response.status_code == 400
        assert "corrupt" in response.json()["detail"].lower() or "invalid" in response.json()["detail"].lower()
