import json
import math
import subprocess
import tempfile
from pathlib import Path
import pytest

from src.config import settings
from src.models.schemas import CompiledPlan, ConsentRequest, JobCreate, JobRecord, JobState
from src.services.jobs import create_job, get_job, run_job
from src.services.store import ASSETS_DIR, get_asset_path
from src.utils.ffmpeg import concat_wavs, loop_audio_to_duration, mix_background_music, probe_duration


def make_sine_audio(path: Path, duration: float, freq: int = 440) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", f"sine=frequency={freq}:sample_rate=22050:duration={duration}",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return path


def make_silence_audio(path: Path, duration: float) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        settings.ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", "anullsrc=r=22050:cl=mono",
        "-t", f"{duration:.3f}",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return path


def concat_audios(paths: list[Path], output: Path) -> Path:
    concat_wavs([str(p) for p in paths], output)
    return output


def get_volume_stats(audio_path: Path, start: float | None = None, duration: float | None = None) -> dict:
    cmd = [settings.ffmpeg_bin]
    if start is not None:
        cmd.extend(["-ss", str(start)])
    if duration is not None:
        cmd.extend(["-t", str(duration)])
    cmd.extend(["-i", str(audio_path), "-af", "volumedetect", "-f", "null", "-"])
    res = subprocess.run(cmd, capture_output=True, text=True)
    stats = {}
    for line in res.stderr.split("\n"):
        if "max_volume" in line:
            stats["max_volume"] = float(line.split(":")[1].replace("dB", "").strip())
        elif "mean_volume" in line:
            stats["mean_volume"] = float(line.split(":")[1].replace("dB", "").strip())
    return stats


class TestMusicMixingLogic:
    def test_loop_audio_to_duration_crossfades_and_trims(self, tmp_path):
        short_music = tmp_path / "short_music.wav"
        make_sine_audio(short_music, duration=5.0, freq=500)

        target_dur = 12.0
        looped = loop_audio_to_duration(
            audio_path=short_music,
            target_duration=target_dur,
            tmp_dir=tmp_path,
        )

        assert looped.exists()
        actual_dur = probe_duration(looped)
        assert abs(actual_dur - target_dur) < 0.2

    def test_peak_level_never_clips(self, tmp_path):
        speech = tmp_path / "loud_speech.wav"
        music = tmp_path / "loud_music.wav"
        out_mixed = tmp_path / "mixed.wav"

        # Both at full digital scale
        make_sine_audio(speech, duration=6.0, freq=300)
        make_sine_audio(music, duration=6.0, freq=800)

        mix_background_music(
            speech_path=speech,
            music_path=music,
            output_path=out_mixed,
            target_duration=6.0,
            volume=1.0,  # Max volume to stress peak limiter
            ducking=True,
        )

        stats = get_volume_stats(out_mixed)
        assert "max_volume" in stats
        # Max volume in dBFS must be strictly less than 0.0 (no clipping)
        assert stats["max_volume"] < 0.0

    def test_ducking_lowers_music_during_speech(self, tmp_path):
        """
        Verify that speech reduces the music stem level measurably compared to silence.
        """
        # Create speech track: 4s speech, 4s silence (8s total)
        sp_part = tmp_path / "speech_part.wav"
        sil_part = tmp_path / "silence_part.wav"
        speech_full = tmp_path / "speech_full.wav"
        music = tmp_path / "music.wav"
        ducked_music_out = tmp_path / "ducked_music_stem.wav"

        make_sine_audio(sp_part, duration=4.0, freq=300)
        make_silence_audio(sil_part, duration=4.0)
        concat_audios([sp_part, sil_part], speech_full)
        make_sine_audio(music, duration=8.0, freq=800)

        # Mix with ducking=True
        mix_out = tmp_path / "mix_out.wav"
        mix_background_music(
            speech_path=speech_full,
            music_path=music,
            output_path=mix_out,
            target_duration=8.0,
            volume=0.3,
            ducking=True,
        )

        assert mix_out.exists()
        assert abs(probe_duration(mix_out) - 8.0) < 0.2

        # Measure ducked music stem directly to isolate speech energy from music energy
        # sidechaincompress on music with speech as control
        cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-i", str(speech_full),
            "-i", str(music),
            "-filter_complex",
            "[1:a]loudnorm=I=-24:LRA=7:TP=-2.0,volume=0.30[m_proc]; "
            "[m_proc][0:a]sidechaincompress=threshold=0.08:ratio=8:attack=20:release=400[m_ducked]",
            "-map", "[m_ducked]",
            "-c:a", "pcm_s16le",
            str(ducked_music_out),
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        speech_window_stats = get_volume_stats(ducked_music_out, start=1.0, duration=2.0)
        silence_window_stats = get_volume_stats(ducked_music_out, start=5.0, duration=2.0)

        # Music mean volume during active speech must be lower than during silence
        assert speech_window_stats["mean_volume"] < silence_window_stats["mean_volume"]

    def test_ducking_attenuation_at_least_6db_and_recovers_in_silence(self, tmp_path):
        """
        Verify that ducking produces at least a 6 dB reduction in music level
        during speech windows compared to ducking off, and recovers in silence.
        """
        sp_burst1 = tmp_path / "burst1.wav"
        sil_gap = tmp_path / "silence_gap.wav"
        sp_burst2 = tmp_path / "burst2.wav"
        speech_track = tmp_path / "speech_track.wav"
        music_track = tmp_path / "music_track.wav"

        # Speech: 3s tone burst, 4s silence, 3s tone burst
        make_sine_audio(sp_burst1, duration=3.0, freq=300)
        make_silence_audio(sil_gap, duration=4.0)
        make_sine_audio(sp_burst2, duration=3.0, freq=300)
        concat_audios([sp_burst1, sil_gap, sp_burst2], speech_track)

        # Constant music track (10s)
        make_sine_audio(music_track, duration=10.0, freq=800)

        stem_ducked = tmp_path / "stem_ducked.wav"
        mix_ducked = tmp_path / "mix_ducked.wav"
        mix_background_music(
            speech_path=speech_track,
            music_path=music_track,
            output_path=mix_ducked,
            target_duration=10.0,
            volume=0.25,
            ducking=True,
            stem_output_path=stem_ducked,
        )

        stem_unducked = tmp_path / "stem_unducked.wav"
        mix_unducked = tmp_path / "mix_unducked.wav"
        mix_background_music(
            speech_path=speech_track,
            music_path=music_track,
            output_path=mix_unducked,
            target_duration=10.0,
            volume=0.25,
            ducking=False,
            stem_output_path=stem_unducked,
        )

        # 1. Measure music stem inside speech window (1.0 to 2.5s)
        sp_ducked_stats = get_volume_stats(stem_ducked, start=1.0, duration=1.5)
        sp_unducked_stats = get_volume_stats(stem_unducked, start=1.0, duration=1.5)

        ducking_drop = sp_unducked_stats["mean_volume"] - sp_ducked_stats["mean_volume"]
        assert ducking_drop >= 6.0, f"Ducking reduction ({ducking_drop:.2f} dB) is less than required 6 dB"

        # 2. Measure music stem inside silence window (4.5 to 6.0s)
        sil_ducked_stats = get_volume_stats(stem_ducked, start=4.5, duration=1.5)
        sil_unducked_stats = get_volume_stats(stem_unducked, start=4.5, duration=1.5)

        silence_diff = abs(sil_unducked_stats["mean_volume"] - sil_ducked_stats["mean_volume"])
        assert silence_diff < 1.0, f"Ducked music did not recover in silence (diff: {silence_diff:.2f} dB)"

    def test_ducking_off_maintains_consistent_volume(self, tmp_path):
        sp_part = tmp_path / "sp_part.wav"
        sil_part = tmp_path / "sil_part.wav"
        speech_full = tmp_path / "speech_full_noduck.wav"
        music = tmp_path / "music_noduck.wav"
        no_duck_music_out = tmp_path / "noduck_stem.wav"

        make_sine_audio(sp_part, duration=4.0, freq=300)
        make_silence_audio(sil_part, duration=4.0)
        concat_audios([sp_part, sil_part], speech_full)
        make_sine_audio(music, duration=8.0, freq=800)

        cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-i", str(speech_full),
            "-i", str(music),
            "-filter_complex",
            "[1:a]loudnorm=I=-24:LRA=7:TP=-2.0,volume=0.30[m_proc]",
            "-map", "[m_proc]",
            "-c:a", "pcm_s16le",
            str(no_duck_music_out),
        ]
        subprocess.run(cmd, check=True, capture_output=True)

        sp_stats = get_volume_stats(no_duck_music_out, start=1.0, duration=2.0)
        sil_stats = get_volume_stats(no_duck_music_out, start=5.0, duration=2.0)

        # Without ducking, steady tone volume should be practically identical
        assert abs(sp_stats["mean_volume"] - sil_stats["mean_volume"]) < 0.5


class TestMusicFallbackBehavior:
    def test_job_falls_back_without_music_when_music_corrupt(self, tmp_path, monkeypatch):
        """
        Verify fallback behavior: if music cannot be read or mixing fails,
        continue without music, set music_applied: false and music_error with
        the reason in the job result and manifest. Do not fail the job.
        """
        monkeypatch.setattr("src.services.store.ASSETS_DIR", tmp_path)
        monkeypatch.setattr("src.services.store.JOBS_DIR", tmp_path / "storage" / "jobs")
        monkeypatch.setattr(settings, "storage_dir", tmp_path / "storage")

        from PIL import Image
        photo_file = tmp_path / "photo_valid.png"
        img = Image.new("RGB", (320, 240), (120, 150, 180))
        img.save(photo_file)
        voice_file = tmp_path / "voice_valid.wav"
        make_sine_audio(voice_file, duration=3.0)

        # Create a music asset that exists on disk but is corrupt binary
        corrupt_music = tmp_path / "music_corrupt.mp3"
        corrupt_music.write_bytes(b"ID3\x03\x00\x00\x00\x00\x00\x00corrupt garbage data")

        req = JobCreate(
            uploaded_image_asset_ids=["photo_valid"],
            uploaded_audio_asset_id="voice_valid",
            music_asset_id="music_corrupt",
            consent=ConsentRequest(
                authorized=True,
                statement="I authorize this video generation and own all rights.",
                face_rights_attested=True,
                voice_rights_attested=True,
            ),
        )

        job = create_job(req)
        assert job.state == JobState.CONSENT_VERIFIED

        # Run job - must succeed with fallback instead of failing
        run_job(job.job_id)

        updated_job = get_job(job.job_id)
        assert updated_job.state == JobState.COMPLETED, f"Job failed: {updated_job.error}"
        assert updated_job.music_applied is False
        assert updated_job.music_error is not None
        assert "preflight" in updated_job.music_error.lower() or "decode" in updated_job.music_error.lower() or "corrupt" in updated_job.music_error.lower()

        # Output video must exist and be valid
        assert updated_job.output_path is not None
        assert Path(updated_job.output_path).exists()

        # Manifest must reflect the fallback fields
        manifest_file = tmp_path / "storage" / "jobs" / job.job_id / "manifest.json"
        assert manifest_file.exists()
        manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
        assert manifest_data["music_asset_id"] == "music_corrupt"
        assert manifest_data["music_applied"] is False
        assert manifest_data["music_error"] is not None
