import pytest
from pathlib import Path
import wave
import struct
from PIL import Image

from src.config import settings
from src.models.schemas import ConsentRequest, JobCreate, JobRecord
from src.services.consent import verify_consent
from src.services.face_detector import (
    clear_face_count_overrides,
    count_faces_in_image,
    evaluate_visual_mode,
    set_face_count_override,
)
from src.services.jobs import create_job, run_job
from src.services.slideshow_compositor import SlideshowCompositor
from src.services.speech_to_text import is_whisper_available, transcribe_audio_to_webvtt
from src.services.store import save_upload
from src.utils.ffmpeg import probe_duration


def make_test_wav(path: Path, duration_seconds: float, sample_rate: int = 22050):
    path.parent.mkdir(parents=True, exist_ok=True)
    n_frames = max(1, int(sample_rate * duration_seconds))
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        raw = b"".join(struct.pack("<h", int(800 * (i % 50) / 50)) for i in range(n_frames))
        wf.writeframes(raw)


def make_test_image(path: Path, color=(120, 160, 200), size=(512, 512)):
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", size, color)
    img.save(path, format="PNG")


@pytest.fixture(autouse=True)
def cleanup_overrides():
    clear_face_count_overrides()
    yield
    clear_face_count_overrides()


def test_image_count_limits_validation():
    consent = ConsentRequest(
        authorized=True,
        ai_generated_accepted=True,
        ai_label_accepted=True,
        statement="I accept this AI generated video and label.",
    )

    # 0 images: rejected
    with pytest.raises(ValueError, match="between 1 and 30"):
        JobCreate(
            uploaded_image_asset_ids=[],
            script="This is a test script with enough words for minimum duration.",
            consent=consent,
        )

    # 31 images: rejected
    with pytest.raises(ValueError, match="between 1 and 30"):
        JobCreate(
            uploaded_image_asset_ids=[f"img_{i}" for i in range(31)],
            script="This is a test script with enough words for minimum duration.",
            consent=consent,
        )

    # 1 image: valid
    j1 = JobCreate(
        uploaded_image_asset_ids=["img_1"],
        script="This is a valid script with enough words.",
        consent=consent,
    )
    assert len(j1.uploaded_image_asset_ids) == 1

    # 30 images: valid
    j30 = JobCreate(
        uploaded_image_asset_ids=[f"img_{i}" for i in range(30)],
        script="This is a valid script with enough words.",
        consent=consent,
    )
    assert len(j30.uploaded_image_asset_ids) == 30


def test_image_durations_validation():
    consent = ConsentRequest(
        authorized=True,
        ai_generated_accepted=True,
        ai_label_accepted=True,
        statement="I accept this AI generated video and label.",
    )

    # Count mismatch between durations and images
    with pytest.raises(ValueError, match="count .* must match"):
        JobCreate(
            uploaded_image_asset_ids=["img_1", "img_2"],
            image_durations=[3.0],
            script="This is a valid script.",
            consent=consent,
        )

    # Duration below minimum 2.0s
    with pytest.raises(ValueError, match="at least 2.0s"):
        JobCreate(
            uploaded_image_asset_ids=["img_1", "img_2"],
            image_durations=[1.5, 3.5],
            script="This is a valid script.",
            consent=consent,
        )


def test_image_ordering_preserved(tmp_path):
    img_ids = [f"asset_img_{i}" for i in range(5)]
    consent = ConsentRequest(
        authorized=True,
        ai_generated_accepted=True,
        ai_label_accepted=True,
        statement="I accept this AI generated video and label.",
    )
    job_req = JobCreate(
        uploaded_image_asset_ids=img_ids,
        script="A script with words for testing.",
        consent=consent,
    )
    assert job_req.uploaded_image_asset_ids == img_ids


def test_face_detector_and_visual_mode_evaluation(tmp_path):
    img1 = tmp_path / "img1.png"
    img2 = tmp_path / "img2.png"
    make_test_image(img1)
    make_test_image(img2)

    # 1. Lip sync not requested -> Slideshow
    mode, reason, face_p = evaluate_visual_mode([img1, img2], prefer_lip_sync=False)
    assert mode == "slideshow"
    assert "lip sync was not requested" in reason.lower()
    assert face_p is None

    # 2. Lip sync requested, 0 faces -> Slideshow with fallback explanation
    set_face_count_override(img1.name, 0)
    set_face_count_override(img2.name, 0)
    mode, reason, face_p = evaluate_visual_mode([img1, img2], prefer_lip_sync=True)
    assert mode == "slideshow"
    assert "no clear face detected" in reason.lower()
    assert face_p is None

    # 3. Lip sync requested, >1 faces -> Slideshow with fallback explanation
    set_face_count_override(img1.name, 1)
    set_face_count_override(img2.name, 1)
    mode, reason, face_p = evaluate_visual_mode([img1, img2], prefer_lip_sync=True)
    assert mode == "slideshow"
    assert "2 faces detected" in reason.lower()
    assert face_p is None

    # 4. Lip sync requested, exactly 1 face -> Talking head Wav2Lip
    set_face_count_override(img1.name, 1)
    set_face_count_override(img2.name, 0)
    mode, reason, face_p = evaluate_visual_mode([img1, img2], prefer_lip_sync=True)
    assert mode == "talking_head"
    assert "wav2lip" in reason.lower()
    assert face_p == img1


def test_durations_add_up_to_audio_length(tmp_path):
    audio_path = tmp_path / "test_speech.wav"
    make_test_wav(audio_path, duration_seconds=6.0)

    # Put audio into store mock
    from src.services import store
    orig_assets_dir = store.ASSETS_DIR
    store.ASSETS_DIR = tmp_path / "assets"
    store.ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        audio_id = "test_audio_asset"
        stored_audio = store.ASSETS_DIR / f"{audio_id}.wav"
        make_test_wav(stored_audio, duration_seconds=6.0)

        img1_id = "img_asset_1"
        img2_id = "img_asset_2"
        make_test_image(store.ASSETS_DIR / f"{img1_id}.png")
        make_test_image(store.ASSETS_DIR / f"{img2_id}.png")

        consent = ConsentRequest(
            authorized=True,
            ai_generated_accepted=True,
            ai_label_accepted=True,
            statement="I accept this AI generated video and label.",
        )

        # Mismatched durations (sum 5.0s != audio 6.0s) -> should fail
        mismatch_req = JobCreate(
            uploaded_image_asset_ids=[img1_id, img2_id],
            image_durations=[2.5, 2.5],
            uploaded_audio_asset_id=audio_id,
            consent=consent,
        )
        with pytest.raises(ValueError, match="must match audio length"):
            create_job(mismatch_req)

        # Matching durations (3.0 + 3.0 = 6.0s) -> succeeds
        match_req = JobCreate(
            uploaded_image_asset_ids=[img1_id, img2_id],
            image_durations=[3.0, 3.0],
            uploaded_audio_asset_id=audio_id,
            consent=consent,
        )
        job = create_job(match_req)
        assert job.job_id.startswith("job_")
        assert abs(float(job.plan.target_duration_seconds) - 6.0) < 0.1

        # Even distribution when durations omitted -> 6.0 / 2 = 3.0s each
        even_req = JobCreate(
            uploaded_image_asset_ids=[img1_id, img2_id],
            uploaded_audio_asset_id=audio_id,
            consent=consent,
        )
        even_job = create_job(even_req)
        assert abs(float(even_job.plan.target_duration_seconds) - 6.0) < 0.1

    finally:
        store.ASSETS_DIR = orig_assets_dir


def test_piper_voice_fallback_when_no_audio(tmp_path):
    from src.services import store
    orig_assets_dir = store.ASSETS_DIR
    store.ASSETS_DIR = tmp_path / "assets"
    store.ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        img_id = "img_piper_test"
        make_test_image(store.ASSETS_DIR / f"{img_id}.png")

        consent = ConsentRequest(
            authorized=True,
            ai_generated_accepted=True,
            ai_label_accepted=True,
            statement="I accept this AI generated video and label.",
        )

        # No audio uploaded: user provides typed script
        req = JobCreate(
            uploaded_image_asset_ids=[img_id],
            script="This is a spoken script generated with Piper local voice synthesizer right now.",
            duration_preset="5s",
            consent=consent,
        )
        job = create_job(req)
        assert job.job_id.startswith("job_")
        assert Path(job.voice_path).exists()
    finally:
        store.ASSETS_DIR = orig_assets_dir


def test_whisper_subtitles_graceful_when_uninstalled(tmp_path):
    assert isinstance(is_whisper_available(), bool)
    non_existent_audio = tmp_path / "fake.wav"
    out_vtt = tmp_path / "sub.vtt"
    # Never raises an unhandled exception when whisper is absent
    res = transcribe_audio_to_webvtt(non_existent_audio, out_vtt)
    assert res is None or res.exists()


def test_slideshow_compositor_user_slideshow_e2e(tmp_path):
    work_dir = tmp_path / "user_slideshow_run"
    work_dir.mkdir(parents=True, exist_ok=True)

    img1 = work_dir / "user_img1.png"
    img2 = work_dir / "user_img2.png"
    make_test_image(img1, color=(140, 80, 80))
    make_test_image(img2, color=(80, 140, 80))

    audio = work_dir / "user_speech.wav"
    make_test_wav(audio, duration_seconds=5.0)

    # 2 images, 2.5s each -> 5.0s total
    out_vid = SlideshowCompositor.compose_user_slideshow(
        job_path=work_dir,
        image_paths=[img1, img2],
        image_durations=[2.5, 2.5],
        audio_path=audio,
    )

    assert out_vid.exists()
    dur = probe_duration(out_vid)
    assert abs(dur - 5.0) < 0.5
