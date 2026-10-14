import io
from pathlib import Path
import socket
import struct
import cv2
import numpy as np
import pytest
import wave

from src.config import settings
from src.models.schemas import ConsentRequest, JobCreate, JobState
from src.services.jobs import create_job, get_job, run_job
from src.services.script_writer import generate_script
from src.services.store import ASSETS_DIR
from src.utils.ffmpeg import probe_duration


class NonLocalhostBlockedError(RuntimeError):
    """Raised when an outbound connection to a non-localhost host is attempted."""
    pass


@pytest.fixture
def guard_non_localhost_network(monkeypatch):
    """
    Socket monkeypatch fixture that strictly blocks any network call
    to non-localhost destinations, permitting only 127.0.0.1, localhost, and ::1.
    """
    orig_connect = socket.socket.connect
    allowed_hosts = {"127.0.0.1", "localhost", "::1", "0.0.0.0"}

    def guarded_connect(self, address):
        host = address[0] if isinstance(address, (tuple, list)) else str(address)
        if host not in allowed_hosts:
            raise NonLocalhostBlockedError(
                f"Forbidden outbound network call to non-localhost address: {host} (target: {address})"
            )
        return orig_connect(self, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    return guarded_connect


def test_guard_blocks_non_localhost_connections(guard_non_localhost_network):
    """Verify that socket calls to external hosts raise NonLocalhostBlockedError."""
    with pytest.raises(NonLocalhostBlockedError, match="Forbidden outbound network call"):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.connect(("93.184.216.34", 80))
        finally:
            s.close()

    with pytest.raises(NonLocalhostBlockedError, match="Forbidden outbound network call"):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.connect(("api.anthropic.com", 443))
        finally:
            s.close()


def test_full_pipeline_zero_non_localhost_network_calls(guard_non_localhost_network, monkeypatch, tmp_path):
    """
    Execute the entire video generation pipeline under active socket guard.
    Fails if any outbound network call to a non-localhost host occurs.
    """
    monkeypatch.setattr(settings, "tts_provider", "piper")
    monkeypatch.setattr(settings, "llm_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_url", "http://127.0.0.1:11434")

    # 1. Run script generation under socket guard (Ollama reachability probe on 127.0.0.1 falls back to template)
    script_result = generate_script(
        prompt="A peaceful stroll through the sunlit pine grove",
        duration_seconds=5.0,
    )
    assert script_result.script_source in ("ollama", "template")
    assert script_result.word_count > 0

    # 2. Prepare synthetic assets
    photo_file = ASSETS_DIR / "photo_offline_eval.jpg"
    img = np.full((360, 360, 3), 200, dtype=np.uint8)
    cv2.circle(img, (180, 180), 80, (150, 120, 100), -1)  # face
    cv2.circle(img, (150, 160), 10, (255, 255, 255), -1)  # left eye
    cv2.circle(img, (210, 160), 10, (255, 255, 255), -1)  # right eye
    cv2.ellipse(img, (180, 220), (20, 10), 0, 0, 180, (50, 50, 50), 3)  # mouth
    cv2.imwrite(str(photo_file), img)

    voice_file = ASSETS_DIR / "voice_offline_eval.wav"
    sr = 22050
    dur = 2.0
    n_frames = int(sr * dur)
    with wave.open(str(voice_file), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        audio = b"".join(struct.pack("<h", int(8000 * np.sin(2 * np.pi * 300 * i / sr))) for i in range(n_frames))
        wf.writeframes(audio)

    # 3. Create and execute job
    consent = ConsentRequest(
        authorized=True,
        statement="I authorize this offline pipeline execution.",
        face_rights_attested=True,
        voice_rights_attested=True,
    )
    req = JobCreate(
        photo_asset_id="photo_offline_eval",
        voice_asset_id="voice_offline_eval",
        script=script_result.script,
        prompt="5 second video",
        consent=consent,
    )

    job = create_job(req)
    assert job.job_id.startswith("job_")

    # 4. Run pipeline - all synthesis and assembly happens 100% locally
    run_job(job.job_id)

    updated = get_job(job.job_id)
    assert updated is not None
    assert updated.state == JobState.COMPLETED
    assert updated.output_path is not None

    output_p = Path(updated.output_path)
    assert output_p.exists()
    assert output_p.stat().st_size > 0

    dur_out = probe_duration(output_p)
    assert dur_out > 0.5
