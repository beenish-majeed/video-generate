from pathlib import Path
from typing import Any, Dict, List, Optional
import io
import wave
import logging
import numpy as np
from scipy import signal
from src.config import settings

logger = logging.getLogger(__name__)

# Strict catalog and allowlist of preset IDs and metadata
MUSIC_PRESETS: Dict[str, Dict[str, Any]] = {
    "calm": {
        "id": "calm",
        "name": "Ambient Calm",
        "description": "Gentle, soothing C-major / F-major ambient sine pad with soft filtering",
        "seed": 1001,
        "base_freqs": [
            [130.81, 196.00, 246.94, 329.63],  # Cmaj7
            [174.61, 220.00, 261.63, 329.63],  # Fmaj7
            [110.00, 164.81, 220.00, 261.63],  # Am7
            [146.83, 174.61, 220.00, 261.63],  # Dm7
        ],
        "cutoff_hz": 1200,
        "lfo_rate": 0.15,
    },
    "warm": {
        "id": "warm",
        "name": "Ambient Warm",
        "description": "Warm, resonant G-major / E-minor chords with rich harmonics",
        "seed": 2002,
        "base_freqs": [
            [98.00, 146.83, 246.94, 293.66],   # G
            [82.41, 123.47, 196.00, 293.66],   # Em7
            [110.00, 164.81, 220.00, 277.18],  # A
            [73.42, 110.00, 146.83, 220.00],   # D
        ],
        "cutoff_hz": 1600,
        "lfo_rate": 0.20,
    },
    "bright": {
        "id": "bright",
        "name": "Ambient Bright",
        "description": "Airy, luminous D-major / A-major harmonics with gentle shimmer",
        "seed": 3003,
        "base_freqs": [
            [146.83, 220.00, 277.18, 369.99],  # Dmaj7
            [110.00, 164.81, 220.00, 277.18],  # Amaj
            [164.81, 246.94, 329.63, 392.00],  # Em
            [123.47, 185.00, 246.94, 293.66],  # Bm
        ],
        "cutoff_hz": 2400,
        "lfo_rate": 0.25,
    },
}

# Strict alias map for normalization (e.g. music_ambient_calm -> calm)
PRESET_ALIASES: Dict[str, str] = {
    "calm": "calm",
    "warm": "warm",
    "bright": "bright",
    "music_ambient_calm": "calm",
    "music_ambient_warm": "warm",
    "music_ambient_bright": "bright",
}


def get_allowed_preset_ids() -> List[str]:
    """Return list of valid public preset IDs."""
    return list(MUSIC_PRESETS.keys())


def is_valid_music_preset_id(preset_id: str) -> bool:
    """Validate preset id against strict allowlist."""
    if not preset_id:
        return False
    return preset_id.strip().lower() in PRESET_ALIASES


def get_music_presets() -> List[Dict[str, str]]:
    """Return strict allowlist of preset id and name only."""
    return [
        {"id": pid, "name": info["name"]}
        for pid, info in MUSIC_PRESETS.items()
    ]


def synthesize_preset_audio(
    preset_id: str,
    duration: float = 30.0,
    sample_rate: int = 44100,
) -> bytes:
    """
    Deterministically synthesize layered soft sine and triangle ambient music
    at 44.1 kHz stereo, filtered and loopable with no clicks.
    """
    canonical_id = PRESET_ALIASES.get(preset_id.strip().lower() if preset_id else "")
    if not canonical_id or canonical_id not in MUSIC_PRESETS:
        raise ValueError(f"Unknown music preset ID: '{preset_id}'")

    conf = MUSIC_PRESETS[canonical_id]
    seed = conf["seed"]
    rng = np.random.RandomState(seed)

    duration = max(5.0, float(duration))
    # Synthesize extra 1.0s to perform seamless circular loop crossfade
    extra_fade_sec = 1.0
    n_target = int(duration * sample_rate)
    n_fade = int(extra_fade_sec * sample_rate)
    total_samples = n_target + n_fade
    total_dur = duration + extra_fade_sec

    t = np.linspace(0, total_dur, total_samples, endpoint=False)

    chords = conf["base_freqs"]
    num_chords = len(chords)
    chord_dur = total_dur / num_chords

    left_accum = np.zeros(total_samples, dtype=np.float64)
    right_accum = np.zeros(total_samples, dtype=np.float64)

    for i, chord in enumerate(chords):
        c_start = i * chord_dur
        c_end = (i + 1) * chord_dur
        center = (c_start + c_end) / 2.0
        half_width = chord_dur

        # Smooth Hann envelope for continuous chord evolution
        env = np.maximum(0.0, np.cos(np.pi * (t - center) / (2.0 * half_width)) ** 2)
        env[np.abs(t - center) > half_width] = 0.0

        for freq in chord:
            phase = rng.uniform(0, 2 * np.pi)
            detune_l = rng.uniform(-0.15, 0.15)
            detune_r = rng.uniform(-0.15, 0.15)

            # Soft sine base + gentle triangle overtone (1/9 amplitude)
            osc_l = np.sin(2 * np.pi * (freq + detune_l) * t + phase)
            osc_r = np.sin(2 * np.pi * (freq + detune_r) * t + phase)
            tri_l = (2.0 / np.pi) * np.arcsin(np.clip(osc_l, -1.0, 1.0))
            tri_r = (2.0 / np.pi) * np.arcsin(np.clip(osc_r, -1.0, 1.0))

            note_l = 0.85 * osc_l + 0.15 * tri_l
            note_r = 0.85 * osc_r + 0.15 * tri_r

            # LFO tremolo & stereo drift
            lfo = 1.0 + 0.06 * np.sin(2 * np.pi * conf["lfo_rate"] * t + phase)
            left_accum += note_l * env * lfo
            right_accum += note_r * env * lfo

    # Gentle low-pass filtering on full track before loop crossfade
    sos = signal.butter(2, conf["cutoff_hz"], "low", fs=sample_rate, output="sos")
    left_filt = signal.sosfilt(sos, left_accum)
    right_filt = signal.sosfilt(sos, right_accum)

    # Circular loop crossfade: blend tail into head so the file loops seamlessly with no click
    if n_fade < n_target // 2:
        lin = np.linspace(0.0, 1.0, n_fade)
        fade_in = np.sin(0.5 * np.pi * lin) ** 2
        fade_out = np.cos(0.5 * np.pi * lin) ** 2
        left_filt[:n_fade] = left_filt[:n_fade] * fade_in + left_filt[n_target : n_target + n_fade] * fade_out
        right_filt[:n_fade] = right_filt[:n_fade] * fade_in + right_filt[n_target : n_target + n_fade] * fade_out

    # Trim to exact target duration
    left_filt = left_filt[:n_target]
    right_filt = right_filt[:n_target]

    # Normalize to -3.0 dBFS peak (0.707)
    max_peak = max(float(np.max(np.abs(left_filt))), float(np.max(np.abs(right_filt))), 1e-6)
    target_peak = 0.70
    left_filt = left_filt * (target_peak / max_peak)
    right_filt = right_filt * (target_peak / max_peak)

    stereo = np.column_stack([left_filt, right_filt])
    stereo_int16 = (np.clip(stereo, -1.0, 1.0) * 32767).astype(np.int16)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(stereo_int16.tobytes())

    return buf.getvalue()


def get_preset_path(preset_id: str, duration: float = 30.0) -> Optional[Path]:
    """
    Get cached file path for a preset. If not cached, generates it deterministically.
    Only allows preset IDs from the predefined catalog (never constructs paths from user input).
    """
    canonical_id = PRESET_ALIASES.get(preset_id.strip().lower() if preset_id else "")
    if not canonical_id or canonical_id not in MUSIC_PRESETS:
        return None

    presets_dir = Path(settings.storage_dir) / "music_presets"
    presets_dir.mkdir(parents=True, exist_ok=True)

    cache_path = presets_dir / f"{canonical_id}.wav"
    if cache_path.exists() and cache_path.stat().st_size > 44:
        return cache_path

    try:
        audio_bytes = synthesize_preset_audio(canonical_id, duration=duration)
        cache_path.write_bytes(audio_bytes)
        return cache_path
    except Exception as exc:
        logger.error(f"Failed to synthesize music preset '{preset_id}': {exc}")
        return None


def resolve_job_music_path(
    music_asset_id: Optional[str] = None,
    music_preset_id: Optional[str] = None,
    duration: float = 30.0,
) -> Optional[Path]:
    """
    Safely resolve music path from either uploaded asset id or preset id.
    Never builds paths from raw user input.
    """
    if music_preset_id:
        return get_preset_path(music_preset_id, duration=duration)
    if music_asset_id:
        from src.services.store import get_asset_path
        return get_asset_path(music_asset_id)
    return None
