from pathlib import Path
import pytest
from src.utils.ffmpeg import adapt_audio_tempo, make_silence_wav, probe_duration


def test_adapt_audio_tempo_slow_to_fast(tmp_path):
    orig = tmp_path / "slow.wav"
    out = tmp_path / "faster.wav"
    make_silence_wav(orig, seconds=12.0)

    # Scale 12.0s to 10.0s (tempo = 1.20)
    success = adapt_audio_tempo(orig, out, target_duration=10.0)
    assert success is True
    assert out.exists()

    new_dur = probe_duration(out)
    assert abs(new_dur - 10.0) < 0.25


def test_adapt_audio_tempo_fast_to_slow(tmp_path):
    orig = tmp_path / "fast.wav"
    out = tmp_path / "slower.wav"
    make_silence_wav(orig, seconds=8.0)

    # Scale 8.0s to 10.0s (tempo = 0.80)
    success = adapt_audio_tempo(orig, out, target_duration=10.0)
    assert success is True
    assert out.exists()

    new_dur = probe_duration(out)
    assert abs(new_dur - 10.0) < 0.25


def test_adapt_audio_tempo_rejects_extreme_ratios(tmp_path):
    orig = tmp_path / "extreme.wav"
    out = tmp_path / "out.wav"
    make_silence_wav(orig, seconds=20.0)

    # 20.0s to 10.0s is 2.0x (far outside default max ratio 1.35)
    success = adapt_audio_tempo(orig, out, target_duration=10.0)
    assert success is False
    assert not out.exists()


def test_adapt_audio_tempo_skips_when_already_matching(tmp_path):
    orig = tmp_path / "matching.wav"
    out = tmp_path / "out.wav"
    make_silence_wav(orig, seconds=10.0)

    # 10.0s to 10.0s (already matching within 2%)
    success = adapt_audio_tempo(orig, out, target_duration=10.0)
    assert success is False
    assert not out.exists()
