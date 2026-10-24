import json
import logging
from pathlib import Path
import subprocess
from typing import Callable, Optional

from src.config import settings
from src.utils.ffmpeg import concat_wavs, make_silence_wav, probe_duration

logger = logging.getLogger(__name__)


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
        ducking: bool = True,
    ) -> Path:
        """
        Duck background music under speech audio using sidechain compression and peak limiting.
        """
        from src.utils.ffmpeg import mix_background_music
        dur = probe_duration(speech_audio_path)
        return mix_background_music(
            speech_path=speech_audio_path,
            music_path=bg_music_path,
            output_path=output_path,
            target_duration=dur,
            volume=volume,
            ducking=ducking,
        )

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

    @classmethod
    def compose_slideshow_job(
        cls,
        job_path: Path,
        plan,
        scenes: list,
        scene_audio_paths: list[Path],
        scene_images: list[Path],
        bg_music_path: Optional[Path] = None,
        bg_music_volume: float = 0.2,
        burn_subtitles: bool = False,
        subtitles_enabled: bool = True,
        watermark_path: Optional[Path] = None,
        cancel_check: Optional[Callable[[], bool]] = None,
    ) -> tuple[Path, Optional[Path]]:
        """
        Full orchestrator for a slideshow job:
        1. Renders Ken Burns scene clips
        2. Crossfades clips with 0.5s transitions
        3. Aligns speech audio with tail silence
        4. Ducks optional background music under speech
        5. Generates and optionally burns subtitles
        6. Multiplexes final 1280x720 30fps H.264+AAC stream-friendly video
        """
        job_path.mkdir(parents=True, exist_ok=True)
        n = len(scenes)
        if n == 0 or len(scene_audio_paths) == 0:
            raise ValueError("No scenes or audio paths provided for slideshow composition.")

        # 1. Render scene clips
        scene_clips: list[Path] = []
        clip_durations: list[float] = []

        for i in range(n):
            if cancel_check and cancel_check():
                raise RuntimeError("Job cancelled by user.")
            audio_p = scene_audio_paths[i]
            img_p = scene_images[i]
            speech_dur = probe_duration(audio_p)
            # Duration equals speech duration plus tail/crossfade
            clip_dur = speech_dur + cls.CROSSFADE_SECONDS

            clip_path = job_path / f"scene_clip_{i:04d}.mp4"
            cls.render_scene_clip(
                image_path=img_p,
                duration_s=clip_dur,
                motion_idx=i,
                output_path=clip_path,
                fps=cls.FPS,
            )
            scene_clips.append(clip_path)
            clip_durations.append(clip_dur)

        # 2. Crossfade clips
        joined_video = job_path / "joined_slideshow.mp4"
        cls.build_crossfade_video(
            scene_clips=scene_clips,
            scene_durations=clip_durations,
            crossfade_s=cls.CROSSFADE_SECONDS,
            output_path=joined_video,
        )

        # 3. Speech audio
        aligned_speech = job_path / "speech_aligned.wav"
        total_audio_dur = cls.build_aligned_speech_audio(
            speech_paths=scene_audio_paths,
            tail_seconds=cls.TAIL_SECONDS,
            output_path=aligned_speech,
        )

        # 4. Background music ducking
        if bg_music_path and Path(bg_music_path).exists():
            mixed_audio = job_path / "final_mixed_audio.wav"
            try:
                cls.duck_background_music(
                    speech_audio_path=aligned_speech,
                    bg_music_path=Path(bg_music_path),
                    volume=bg_music_volume,
                    output_path=mixed_audio,
                    ducking=getattr(plan, "music_ducking", True),
                )
                final_audio_path = mixed_audio
                plan.music_applied = True
            except Exception as exc:
                logger.warning(f"Slideshow background music mixing failed: {exc}. Continuing without music.")
                plan.music_applied = False
                plan.music_error = str(exc)
                final_audio_path = aligned_speech
        else:
            final_audio_path = aligned_speech

        # 5. Subtitles
        subtitle_path = None
        if subtitles_enabled:
            from src.models.schemas import Timeline, TimelineEvent, TTSSegment
            from src.services.subtitles import generate_webvtt

            events = []
            tts_segments_map = {}
            curr_s = 0.0
            for i, sc in enumerate(scenes):
                sd = probe_duration(scene_audio_paths[i])
                ev_id = f"scene_sub_{i:04d}"
                events.append(
                    TimelineEvent(
                        event_id=ev_id,
                        type="speech",
                        start_s=round(curr_s, 2),
                        end_s=round(curr_s + sd, 2),
                        text=getattr(sc, "text", str(sc)),
                    )
                )
                tts_segments_map[ev_id] = TTSSegment(
                    event_id=ev_id,
                    audio_path=str(scene_audio_paths[i]),
                    duration_seconds=round(sd, 2),
                )
                curr_s += sd

            sub_timeline = Timeline(events=events, total_duration_seconds=round(curr_s, 2))
            subtitle_path = job_path / "subtitles.vtt"
            generate_webvtt(sub_timeline, tts_segments_map, subtitle_path)

        # 6. Final multiplexing
        final_video_path = job_path / "final_video.mp4"
        target_dur = float(plan.target_duration_seconds)
        cls.multiplex_final(
            video_path=joined_video,
            audio_path=final_audio_path,
            output_path=final_video_path,
            target_duration=target_dur,
            subtitle_path=subtitle_path,
            burn_subtitles=burn_subtitles,
            watermark_path=watermark_path,
        )

        return final_video_path, subtitle_path

    @classmethod
    def compose_user_slideshow(
        cls,
        job_path: Path,
        image_paths: list[Path],
        image_durations: list[float],
        audio_path: Path,
        bg_music_path: Optional[Path] = None,
        bg_music_volume: float = 0.2,
        bg_music_ducking: bool = True,
        subtitle_path: Optional[Path] = None,
        burn_subtitles: bool = False,
        watermark_path: Optional[Path] = None,
        cancel_check: Optional[Callable[[], bool]] = None,
    ) -> Path:
        """
        Orchestrator for 'my own images' slideshow mode:
        1. Renders Ken Burns clips for uploaded images with user-specified or evenly distributed durations.
        2. Crossfades clips (xfade 0.5s).
        3. Ducks background music if provided.
        4. Multiplexes final video with speech audio and optional subtitles/watermark.
        """
        job_path.mkdir(parents=True, exist_ok=True)
        n = len(image_paths)
        if n == 0:
            raise ValueError("No images provided for slideshow composition.")

        scene_clips: list[Path] = []
        clip_durations: list[float] = []

        for i in range(n):
            if cancel_check and cancel_check():
                raise RuntimeError("Job cancelled by user.")
            img_p = image_paths[i]
            d = image_durations[i]
            # When crossfading, all clips except the last need an extra crossfade tail
            clip_dur = d + (cls.CROSSFADE_SECONDS if (n > 1 and i < n - 1) else 0.0)

            clip_path = job_path / f"user_clip_{i:04d}.mp4"
            cls.render_scene_clip(
                image_path=img_p,
                duration_s=clip_dur,
                motion_idx=i,
                output_path=clip_path,
                fps=cls.FPS,
            )
            scene_clips.append(clip_path)
            clip_durations.append(clip_dur)

        # Crossfade clips
        joined_video = job_path / "joined_user_slideshow.mp4"
        cls.build_crossfade_video(
            scene_clips=scene_clips,
            scene_durations=clip_durations,
            crossfade_s=cls.CROSSFADE_SECONDS,
            output_path=joined_video,
        )

        # Background music ducking if provided
        if bg_music_path and Path(bg_music_path).exists():
            mixed_audio = job_path / "final_mixed_audio.wav"
            try:
                cls.duck_background_music(
                    speech_audio_path=audio_path,
                    bg_music_path=Path(bg_music_path),
                    volume=bg_music_volume,
                    output_path=mixed_audio,
                    ducking=bg_music_ducking,
                )
                final_audio_path = mixed_audio
            except Exception as exc:
                logger.warning(f"Background music mixing failed: {exc}. Continuing without music.")
                final_audio_path = audio_path
        else:
            final_audio_path = audio_path

        # Multiplex final
        final_video_path = job_path / "final_video.mp4"
        target_dur = sum(image_durations)
        cls.multiplex_final(
            video_path=joined_video,
            audio_path=final_audio_path,
            output_path=final_video_path,
            target_duration=target_dur,
            subtitle_path=subtitle_path,
            burn_subtitles=burn_subtitles,
            watermark_path=watermark_path,
        )

        return final_video_path
