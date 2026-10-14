import json
from pathlib import Path
import subprocess
from typing import Optional

from src.config import settings
from src.utils.ffmpeg import concat_wavs, make_silence_wav, probe_duration


class SlideshowCompositor:
    """
    FFmpeg-based compositor for slideshow-style text-to-video.
    Features:
    - Ken Burns alternating camera motions (zoom in, zoom out, pan left, pan right)
    - Anti-jitter upscaling before zoompan
    - Crossfade scene transitions (xfade, 0.5s)
    - Precise speech audio synchronization without speech overlap or drift
    - Optional background music ducked under speech with sidechaincompress
    - Subtitle burn-in with clear, readable typography
    - Memory-efficient scene-by-scene streaming (no raw frames in RAM)
    - Output: 1280x720 @ 30 fps, H.264 (CRF 20, fast) + AAC, yuv420p, +faststart
    """

    CROSSFADE_SECONDS = 0.5
    TAIL_SECONDS = 0.5
    FPS = 30
    WIDTH = 1280
    HEIGHT = 720
    UPSCALE_WIDTH = 2560
    UPSCALE_HEIGHT = 1440

    @classmethod
    def get_motion_filter(cls, motion_idx: int, total_frames: int, fps: int = 30) -> str:
        """
        Build zoompan filter for the specified motion index (modulo 4).
        0: Zoom In  (1.0 -> 1.15, centered)
        1: Zoom Out (1.15 -> 1.0, centered)
        2: Pan Left (z=1.15, moves window from right to left)
        3: Pan Right(z=1.15, moves window from left to right)
        Operates on upscaled image to prevent subpixel jitter.
        """
        d = max(1, total_frames)
        mode = motion_idx % 4

        scale_prefix = f"scale={cls.UPSCALE_WIDTH}:{cls.UPSCALE_HEIGHT}"

        if mode == 0:
            # Zoom In
            zoompan = (
                f"zoompan=z='1.0+(0.15*on/{d})':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"
                f":d={d}:s={cls.WIDTH}x{cls.HEIGHT}:fps={fps}"
            )
        elif mode == 1:
            # Zoom Out
            zoompan = (
                f"zoompan=z='1.15-(0.15*on/{d})':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2'"
                f":d={d}:s={cls.WIDTH}x{cls.HEIGHT}:fps={fps}"
            )
        elif mode == 2:
            # Pan Left (window moves right to left across width)
            zoompan = (
                f"zoompan=z='1.15':x='(iw-iw/zoom)*(1.0-(on/{d}))':y='(ih-ih/zoom)/2'"
                f":d={d}:s={cls.WIDTH}x{cls.HEIGHT}:fps={fps}"
            )
        else:
            # Pan Right (window moves left to right across width)
            zoompan = (
                f"zoompan=z='1.15':x='(iw-iw/zoom)*(on/{d})':y='(ih-ih/zoom)/2'"
                f":d={d}:s={cls.WIDTH}x{cls.HEIGHT}:fps={fps}"
            )

        return f"{scale_prefix},{zoompan}"

    @classmethod
    def render_scene_clip(
        cls,
        image_path: Path,
        duration_s: float,
        motion_idx: int,
        output_path: Path,
        fps: int = 30,
    ) -> Path:
        """
        Render a single scene clip with Ken Burns motion.
        Streams directly to disk; never buffers frames in RAM.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        total_frames = max(1, int(round(duration_s * fps)))
        vf = cls.get_motion_filter(motion_idx, total_frames, fps=fps)

        cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-i",
            str(image_path),
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-crf",
            "20",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            "-t",
            f"{duration_s:.3f}",
            str(output_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg render_scene_clip failed: {res.stderr[-400:]}")
        return output_path

    @classmethod
    def build_crossfade_video(
        cls,
        scene_clips: list[Path],
        scene_durations: list[float],
        crossfade_s: float = 0.5,
        output_path: Path = Path("crossfaded.mp4"),
    ) -> tuple[Path, int]:
        """
        Combine scene clips using xfade transitions (fade, crossfade_s).
        Returns (output_path, crossfade_count).
        Handles N=1 seamlessly with zero crossfades.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        n = len(scene_clips)

        if n == 0:
            raise ValueError("No scene clips provided to crossfade.")

        if n == 1:
            # Single scene: re-encode to target or copy
            cmd = [
                settings.ffmpeg_bin,
                "-y",
                "-i",
                str(scene_clips[0]),
                "-c:v",
                "copy",
                str(output_path),
            ]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"FFmpeg copy single clip failed: {res.stderr[-400:]}")
            return output_path, 0

        # Build filtergraph for N clips
        cmd = [settings.ffmpeg_bin, "-y"]
        for clip in scene_clips:
            cmd.extend(["-i", str(clip)])

        filter_parts = []
        cur_label = "[0:v]"
        accum_dur = scene_durations[0]

        for i in range(1, n):
            offset = accum_dur - crossfade_s
            next_input = f"[{i}:v]"
            out_label = f"[v{i}]" if i < n - 1 else "[vout]"
            filter_parts.append(
                f"{cur_label}{next_input}xfade=transition=fade:duration={crossfade_s:.3f}:offset={offset:.3f}{out_label}"
            )
            cur_label = out_label
            accum_dur = accum_dur + scene_durations[i] - crossfade_s

        filter_str = "; ".join(filter_parts)
        cmd.extend(
            [
                "-filter_complex",
                filter_str,
                "-map",
                "[vout]",
                "-c:v",
                "libx264",
                "-crf",
                "20",
                "-preset",
                "fast",
                "-pix_fmt",
                "yuv420p",
                str(output_path),
            ]
        )

        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg xfade failed: {res.stderr[-400:]}")

        return output_path, n - 1

    @classmethod
    def build_aligned_speech_audio(
        cls,
        speech_paths: list[Path],
        tail_seconds: float = 0.5,
        output_path: Path = Path("speech_aligned.wav"),
    ) -> float:
        """
        Concatenate speech audio files sequentially and append tail silence.
        Because each scene's video lasts D_i + crossfade_s, and crossfades overlap
        by crossfade_s, the speech audio timeline aligns exactly with scene visual transitions.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if not speech_paths:
            make_silence_wav(output_path, seconds=tail_seconds)
            return tail_seconds

        silence_file = output_path.parent / "temp_tail_silence.wav"
        make_silence_wav(silence_file, seconds=tail_seconds)

        all_paths = [str(p) for p in speech_paths] + [str(silence_file)]
        concat_wavs(all_paths, output_path)

        try:
            silence_file.unlink(missing_ok=True)
        except Exception:
            pass

        return probe_duration(output_path)

    @classmethod
    def duck_background_music(
        cls,
        speech_audio_path: Path,
        bg_music_path: Path,
        volume: float,
        output_path: Path,
    ) -> Path:
        """
        Duck background music under speech audio using sidechaincompress filter.
        Sidechain compressor compresses/reduces the background music volume whenever
        speech is detected, then amix mixes speech and ducked music.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        clamped_volume = max(0.01, min(1.0, float(volume)))

        filter_complex = (
            f"[1:a]volume={clamped_volume}[bg_vol]; "
            f"[bg_vol][0:a]sidechaincompress=threshold=0.1:ratio=5:attack=20:release=250[bg_ducked]; "
            f"[0:a][bg_ducked]amix=inputs=2:duration=first:dropout_transition=0[aout]"
        )

        cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-i",
            str(speech_audio_path),
            "-stream_loop",
            "-1",
            "-i",
            str(bg_music_path),
            "-filter_complex",
            filter_complex,
            "-map",
            "[aout]",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            # Fall back to un-ducked speech if mixing fails
            output_path.write_bytes(speech_audio_path.read_bytes())
        return output_path

    @classmethod
    def multiplex_final(
        cls,
        video_path: Path,
        audio_path: Path,
        output_path: Path,
        target_duration: float,
        subtitle_path: Optional[Path] = None,
        burn_subtitles: bool = False,
        watermark_path: Optional[Path] = None,
    ) -> Path:
        """
        Multiplex final video and audio with optional subtitle burning,
        AI label watermark, CRF 20, fast preset, and +faststart.
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(audio_path),
        ]

        filter_parts = []
        current_video = None

        if watermark_path and Path(watermark_path).exists():
            cmd.extend(["-i", str(watermark_path)])
            in_label = current_video or "[0:v]"
            filter_parts.append(
                f"{in_label}[2:v]overlay=main_w-overlay_w-24:main_h-overlay_h-24[vwatermarked]"
            )
            current_video = "[vwatermarked]"

        if burn_subtitles and subtitle_path and Path(subtitle_path).exists():
            # Use relative path or posix path for ffmpeg subtitles filter
            try:
                rel_sub = str(subtitle_path.relative_to(Path.cwd())).replace("\\", "/")
            except Exception:
                rel_sub = subtitle_path.resolve().as_posix().replace(":", "\\:")

            style_str = "FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=30"
            in_label = current_video or "[0:v]"
            filter_parts.append(f"{in_label}subtitles='{rel_sub}':force_style='{style_str}'[vsubtitled]")
            current_video = "[vsubtitled]"

        if filter_parts:
            cmd.extend(["-filter_complex", ";".join(filter_parts)])
            video_map = current_video
        else:
            video_map = "0:v"

        cmd.extend(
            [
                "-map",
                video_map,
                "-map",
                "1:a",
                "-c:v",
                "libx264",
                "-crf",
                "20",
                "-preset",
                "fast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                "-t",
                f"{target_duration:.3f}",
                str(output_path),
            ]
        )

        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg multiplex_final failed: {res.stderr[-400:]}")

        return output_path

    @classmethod
    def probe_av_sync_error(cls, video_path: Path) -> tuple[float, float, float]:
        """
        Probe a video container to verify video stream duration,
        audio stream duration, and A/V sync error in milliseconds.
        Returns (video_duration_s, audio_duration_s, sync_error_ms).
        """
        cmd = [
            settings.ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type,duration:format=duration",
            "-of",
            "json",
            str(video_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)

        v_dur = None
        a_dur = None
        for s in data.get("streams", []):
            if s.get("codec_type") == "video" and "duration" in s:
                v_dur = float(s["duration"])
            elif s.get("codec_type") == "audio" and "duration" in s:
                a_dur = float(s["duration"])

        fmt_dur = float(data.get("format", {}).get("duration", 0.0))
        if v_dur is None:
            v_dur = fmt_dur
        if a_dur is None:
            a_dur = fmt_dur

        sync_error_ms = abs(v_dur - a_dur) * 1000.0
        return v_dur, a_dur, sync_error_ms
