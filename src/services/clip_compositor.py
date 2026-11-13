import logging
from pathlib import Path
import shutil
import uuid
from typing import Callable, Optional

from src.config import settings
from src.models.schemas import CompiledPlan
from src.services.slideshow_compositor import SlideshowCompositor
from src.utils.ffmpeg import probe_duration
from src.utils.subprocess_runner import run_subprocess

logger = logging.getLogger(__name__)


class ClipCompositor:
    """
    Compositor for the 'ai_clips' visual mode.
    Assembles user-uploaded AI video clips with precise audio alignment,
    crossfades, narration, background music ducking, subtitles, and burnt-in AI labels.
    """

    CROSSFADE_SECONDS = 0.5
    TAIL_SECONDS = 0.5
    TARGET_WIDTH = 1280
    TARGET_HEIGHT = 720
    TARGET_FPS = 30

    @classmethod
    def standardize_clip(
        cls,
        input_clip: Path,
        target_visual_duration: float,
        output_path: Path,
    ) -> Path:
        """
        Normalize clip to 1280x720 @ 30fps H.264 yuv420p without audio.
        Applies:
        - If input_dur >= target: trim to target duration
        - If input_dur < target and ratio <= 1.25: slow down video smoothly (setpts=r*PTS)
        - If input_dur < target and ratio > 1.25: slow down by 1.25x and hold (clone) last frame
        - Scale with aspect preservation and letterbox padding to 1280x720
        - Enforces bounded memory and -protocol_whitelist file,pipe
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        clip_dur = probe_duration(input_clip)
        if clip_dur <= 0.05:
            clip_dur = 1.0

        target_dur = max(0.5, float(target_visual_duration))
        ratio = target_dur / clip_dur

        scale_pad = (
            f"scale={cls.TARGET_WIDTH}:{cls.TARGET_HEIGHT}:force_original_aspect_ratio=decrease,"
            f"pad={cls.TARGET_WIDTH}:{cls.TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps={cls.TARGET_FPS}"
        )

        if clip_dur >= target_dur:
            # Clip is long enough; trim to target visual duration
            vf = scale_pad
        elif ratio <= 1.25:
            # Slight slowdown (<= 1.25x)
            vf = f"setpts={ratio:.4f}*PTS,{scale_pad}"
        else:
            # Slow down by 1.25x max, then hold last frame for remainder
            slowed_dur = clip_dur * 1.25
            hold_sec = max(0.01, target_dur - slowed_dur)
            vf = (
                f"setpts=1.25*PTS,"
                f"scale={cls.TARGET_WIDTH}:{cls.TARGET_HEIGHT}:force_original_aspect_ratio=decrease,"
                f"pad={cls.TARGET_WIDTH}:{cls.TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,"
                f"tpad=stop_mode=clone:stop_duration={hold_sec:.3f},"
                f"fps={cls.TARGET_FPS}"
            )

        cmd = [
            settings.ffmpeg_bin,
            "-y",
            "-nostdin",
            "-protocol_whitelist", "file",
            "-i", str(input_clip),
            "-t", f"{target_dur:.3f}",
            "-vf", vf,
            "-an",
            "-c:v", "libx264",
            "-crf", "20",
            "-preset", "fast",
            "-pix_fmt", "yuv420p",
            str(output_path),
        ]

        res = run_subprocess(cmd, timeout=settings.subprocess_render_timeout_seconds)
        if res.returncode != 0 or not output_path.exists():
            err_msg = res.stderr[-400:] if hasattr(res, "stderr") else "unknown error"
            raise RuntimeError(f"FFmpeg standardize_clip failed on {input_clip}: {err_msg}")

        return output_path

    @classmethod
    def compose_clips_job(
        cls,
        job_path: Path,
        plan: CompiledPlan,
        clip_paths: list[Path],
        scene_durations: list[float],
        scene_audio_paths: list[Path],
        scene_texts: Optional[list[str]] = None,
        bg_music_path: Optional[Path] = None,
        bg_music_volume: float = 0.25,
        burn_subtitles: bool = True,
        subtitles_enabled: bool = True,
        watermark_path: Optional[Path] = None,
        cancel_check: Optional[Callable[[], bool]] = None,
    ) -> tuple[Path, Optional[Path]]:
        """
        Assemble standardized AI clips with crossfades, aligned narration audio,
        optional background music with ducking, burnt AI label, subtitles, and provenance metadata.
        """
        if not clip_paths:
            raise ValueError("No video clips provided for ai_clips composition.")

        if not scene_audio_paths:
            raise ValueError("No narration audio segments provided for ai_clips composition.")

        num_scenes = len(scene_durations)
        if num_scenes == 0:
            raise ValueError("Scene durations list cannot be empty.")

        segments_dir = job_path / "clip_segments"
        segments_dir.mkdir(parents=True, exist_ok=True)

        standardized_clips: list[Path] = []
        crossfade_s = cls.CROSSFADE_SECONDS if num_scenes > 1 else 0.0

        for i in range(num_scenes):
            if cancel_check and cancel_check():
                raise RuntimeError("Job was cancelled by user.")

            clip_source = clip_paths[i % len(clip_paths)]
            d_i = scene_durations[i]
            # Each scene visual segment needs D_i + crossfade_s
            # (or D_i + tail for single scene)
            vis_dur = d_i + (crossfade_s if i < num_scenes - 1 else cls.TAIL_SECONDS)

            seg_path = segments_dir / f"clip_standardized_{i:03d}.mp4"
            cls.standardize_clip(
                input_clip=clip_source,
                target_visual_duration=vis_dur,
                output_path=seg_path,
            )
            standardized_clips.append(seg_path)

        if cancel_check and cancel_check():
            raise RuntimeError("Job was cancelled by user.")

        # 1. Crossfade visual clips
        visual_assembled = job_path / "visual_assembled.mp4"
        SlideshowCompositor.build_crossfade_video(
            scene_clips=standardized_clips,
            scene_durations=scene_durations,
            crossfade_s=crossfade_s,
            output_path=visual_assembled,
        )

        if cancel_check and cancel_check():
            raise RuntimeError("Job was cancelled by user.")

        # 2. Aligned narration audio assembly
        speech_aligned = job_path / "speech_aligned.wav"
        total_audio_dur = SlideshowCompositor.build_aligned_speech_audio(
            speech_paths=scene_audio_paths,
            tail_seconds=cls.TAIL_SECONDS,
            output_path=speech_aligned,
        )

        # 3. Duck background music under speech
        if bg_music_path and Path(bg_music_path).exists():
            mixed_audio = job_path / "mixed_audio.wav"
            SlideshowCompositor.duck_background_music(
                speech_audio_path=speech_aligned,
                bg_music_path=Path(bg_music_path),
                volume=bg_music_volume,
                output_path=mixed_audio,
                ducking=True,
            )
            final_audio = mixed_audio
        else:
            final_audio = speech_aligned

        if cancel_check and cancel_check():
            raise RuntimeError("Job was cancelled by user.")

        # 4. Subtitles generation
        subtitle_path: Optional[Path] = None
        if subtitles_enabled and scene_texts:
            subtitle_path = job_path / "subtitles.vtt"
            with open(subtitle_path, "w", encoding="utf-8") as f:
                f.write("WEBVTT\n\n")
                current_offset = 0.0
                for idx, text in enumerate(scene_texts):
                    d_i = scene_durations[idx] if idx < len(scene_durations) else 5.0
                    start_s = current_offset
                    end_s = current_offset + d_i

                    def _fmt_ts(sec: float) -> str:
                        h = int(sec // 3600)
                        m = int((sec % 3600) // 60)
                        s = int(sec % 60)
                        ms = int(round((sec - int(sec)) * 1000))
                        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

                    f.write(f"{idx + 1}\n")
                    f.write(f"{_fmt_ts(start_s)} --> {_fmt_ts(end_s)}\n")
                    f.write(f"{text.strip()}\n\n")
                    current_offset = end_s

        # 5. Burnt AI Label Watermark
        if watermark_path is None or not Path(watermark_path).exists():
            watermark_path = job_path / "ai_label.png"
            if not watermark_path.exists():
                from src.utils.images import create_ai_label_png
                label_text = (
                    plan.safety.label_text
                    if plan and plan.safety and plan.safety.label_text
                    else "AI-generated"
                )
                create_ai_label_png(watermark_path, label_text)

        # 6. Final Multiplex with AI label, provenance metadata, CRF 20, faststart
        final_video = job_path / "final_video.mp4"
        SlideshowCompositor.multiplex_final(
            video_path=visual_assembled,
            audio_path=final_audio,
            output_path=final_video,
            target_duration=total_audio_dur,
            subtitle_path=subtitle_path,
            burn_subtitles=burn_subtitles,
            watermark_path=watermark_path,
        )

        return final_video, subtitle_path
