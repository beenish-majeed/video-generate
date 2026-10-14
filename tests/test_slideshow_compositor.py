import json
from pathlib import Path
import subprocess
import wave
import struct
import pytest
from PIL import Image

from src.config import settings
from src.services.slideshow_compositor import SlideshowCompositor
from src.utils.ffmpeg import probe_duration


def make_tiny_wav(path: Path, duration_seconds: float, sample_rate: int = 22050):
    path.parent.mkdir(parents=True, exist_ok=True)
    n_frames = max(1, int(sample_rate * duration_seconds))
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        # 440 Hz gentle tone
        raw = b"".join(struct.pack("<h", int(800 * (i % 50) / 50)) for i in range(n_frames))
        wf.writeframes(raw)


def make_tiny_image(path: Path, color=(100, 150, 200), size=(512, 512)):
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", size, color)
    img.save(path, format="PNG")


class TestSlideshowCompositor:
    @pytest.fixture
    def work_dir(self, tmp_path):
        d = tmp_path / "slideshow_test"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def test_single_scene_no_crash_zero_crossfades(self, work_dir):
        # 1 image, 1 audio clip (2.0s)
        img = work_dir / "scene0.png"
        make_tiny_image(img, color=(80, 120, 160))
        audio = work_dir / "audio0.wav"
        make_tiny_wav(audio, duration_seconds=2.0)

        # Render clip: duration = 2.0 + 0.5 tail = 2.5s
        clip = work_dir / "clip0.mp4"
        SlideshowCompositor.render_scene_clip(
            image_path=img,
            duration_s=2.5,
            motion_idx=0,
            output_path=clip,
            fps=30,
        )
        assert clip.exists()
        dur = probe_duration(clip)
        assert abs(dur - 2.5) < 0.15

        # Crossfade with N=1
        xfade_out = work_dir / "xfade_single.mp4"
        out_path, xfade_count = SlideshowCompositor.build_crossfade_video(
            scene_clips=[clip],
            scene_durations=[2.5],
            crossfade_s=0.5,
            output_path=xfade_out,
        )
        assert out_path.exists()
        assert xfade_count == 0
        assert abs(probe_duration(out_path) - 2.5) < 0.15

    def test_ken_burns_four_motions_alternate(self, work_dir):
        img = work_dir / "kb_test.png"
        make_tiny_image(img, color=(140, 90, 120))

        # Test all 4 motions (0: zoom in, 1: zoom out, 2: pan left, 3: pan right)
        for idx in range(4):
            out_clip = work_dir / f"motion_{idx}.mp4"
            SlideshowCompositor.render_scene_clip(
                image_path=img,
                duration_s=1.0,
                motion_idx=idx,
                output_path=out_clip,
                fps=30,
            )
            assert out_clip.exists()
            assert abs(probe_duration(out_clip) - 1.0) < 0.15

    def test_multi_scene_crossfade_and_sync_under_100ms(self, work_dir):
        # 3 scenes: 2.0s, 2.5s, 3.0s speech audio
        speech_durations = [2.0, 2.5, 3.0]
        clips = []
        clip_durations = []
        speech_paths = []

        colors = [(200, 70, 70), (70, 200, 70), (70, 70, 200)]

        for i, (sd, col) in enumerate(zip(speech_durations, colors)):
            img_p = work_dir / f"scene_{i}.png"
            make_tiny_image(img_p, color=col)

            aud_p = work_dir / f"speech_{i}.wav"
            make_tiny_wav(aud_p, duration_seconds=sd)
            speech_paths.append(aud_p)

            # Each scene video clip duration = speech duration + crossfade_s (0.5s)
            cd = sd + 0.5
            clip_p = work_dir / f"clip_{i}.mp4"
            SlideshowCompositor.render_scene_clip(
                image_path=img_p,
                duration_s=cd,
                motion_idx=i,
                output_path=clip_p,
                fps=30,
            )
            clips.append(clip_p)
            clip_durations.append(cd)

        # Crossfade video
        xfade_video = work_dir / "xfade_video.mp4"
        out_v, xfade_count = SlideshowCompositor.build_crossfade_video(
            scene_clips=clips,
            scene_durations=clip_durations,
            crossfade_s=0.5,
            output_path=xfade_video,
        )
        assert xfade_count == len(clips) - 1 == 2

        # Aligned speech audio
        aligned_audio = work_dir / "aligned_audio.wav"
        total_audio_dur = SlideshowCompositor.build_aligned_speech_audio(
            speech_paths=speech_paths,
            tail_seconds=0.5,
            output_path=aligned_audio,
        )

        # Expected total duration = sum(speech_durations) + 0.5s tail = 7.5 + 0.5 = 8.0s
        expected_dur = sum(speech_durations) + 0.5
        assert abs(total_audio_dur - expected_dur) < 0.15

        # Multiplex final video
        final_video = work_dir / "final_synced.mp4"
        SlideshowCompositor.multiplex_final(
            video_path=out_v,
            audio_path=aligned_audio,
            output_path=final_video,
            target_duration=expected_dur,
        )
        assert final_video.exists()

        # Check A/V sync with ffprobe
        v_dur, a_dur, sync_error_ms = SlideshowCompositor.probe_av_sync_error(final_video)
        assert abs(v_dur - expected_dur) < 0.15
        assert abs(a_dur - expected_dur) < 0.15
        # Sync error MUST be under 100 ms
        assert sync_error_ms < 100.0, f"Sync error {sync_error_ms:.2f} ms exceeds 100 ms"

    def test_background_music_ducked_with_sidechaincompress(self, work_dir):
        speech_wav = work_dir / "speech_duck.wav"
        make_tiny_wav(speech_wav, duration_seconds=3.0)

        bg_music = work_dir / "bg_music.wav"
        make_tiny_wav(bg_music, duration_seconds=5.0)

        out_mixed = work_dir / "ducked_mix.wav"
        SlideshowCompositor.duck_background_music(
            speech_audio_path=speech_wav,
            bg_music_path=bg_music,
            volume=0.25,
            output_path=out_mixed,
        )
        assert out_mixed.exists()
        # Mixed audio should match speech duration
        dur = probe_duration(out_mixed)
        assert abs(dur - 3.0) < 0.2

    def test_subtitle_burn_in_option(self, work_dir):
        img = work_dir / "sub_scene.png"
        make_tiny_image(img, color=(50, 50, 60))
        clip = work_dir / "sub_clip.mp4"
        SlideshowCompositor.render_scene_clip(
            image_path=img,
            duration_s=2.0,
            motion_idx=0,
            output_path=clip,
            fps=30,
        )

        audio = work_dir / "sub_audio.wav"
        make_tiny_wav(audio, duration_seconds=2.0)

        vtt_file = work_dir / "test_captions.vtt"
        vtt_file.write_text(
            "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.500\nClear readable subtitle text\n",
            encoding="utf-8",
        )

        out_burned = work_dir / "burned_subtitles.mp4"
        SlideshowCompositor.multiplex_final(
            video_path=clip,
            audio_path=audio,
            output_path=out_burned,
            target_duration=2.0,
            subtitle_path=vtt_file,
            burn_subtitles=True,
        )
        assert out_burned.exists()
        assert probe_duration(out_burned) > 1.8

    def test_30s_sample_full_pipeline_ffprobe(self, work_dir):
        # Create a full 30s sample (5 scenes of ~5.9s speech each = 29.5s + 0.5s tail = 30.0s)
        n_scenes = 5
        speech_per_scene = 5.9
        speech_paths = []
        clips = []
        clip_durations = []

        for i in range(n_scenes):
            img = work_dir / f"sample30_{i}.png"
            make_tiny_image(img, color=(40 + i * 30, 80 + i * 20, 120 + i * 15))

            aud = work_dir / f"sample30_speech_{i}.wav"
            make_tiny_wav(aud, duration_seconds=speech_per_scene)
            speech_paths.append(aud)

            cd = speech_per_scene + 0.5
            clip = work_dir / f"sample30_clip_{i}.mp4"
            SlideshowCompositor.render_scene_clip(
                image_path=img,
                duration_s=cd,
                motion_idx=i,
                output_path=clip,
                fps=30,
            )
            clips.append(clip)
            clip_durations.append(cd)

        # Crossfade video (4 crossfades)
        xfade_video = work_dir / "sample30_xfade.mp4"
        _, xfade_count = SlideshowCompositor.build_crossfade_video(
            scene_clips=clips,
            scene_durations=clip_durations,
            crossfade_s=0.5,
            output_path=xfade_video,
        )
        assert xfade_count == 4

        # Aligned audio
        aligned_audio = work_dir / "sample30_audio.wav"
        total_audio_dur = SlideshowCompositor.build_aligned_speech_audio(
            speech_paths=speech_paths,
            tail_seconds=0.5,
            output_path=aligned_audio,
        )

        target_30s = 30.0
        final_video = work_dir / "sample30_final.mp4"
        SlideshowCompositor.multiplex_final(
            video_path=xfade_video,
            audio_path=aligned_audio,
            output_path=final_video,
            target_duration=target_30s,
        )

        assert final_video.exists()

        # Probe with ffprobe
        v_dur, a_dur, sync_error_ms = SlideshowCompositor.probe_av_sync_error(final_video)

        # Total duration must stay within 10% of requested 30s [27.0s, 33.0s]
        assert 27.0 <= v_dur <= 33.0
        assert 27.0 <= a_dur <= 33.0
        # A/V sync error under 100 ms
        assert sync_error_ms < 100.0

        # Detailed stream verification via ffprobe
        cmd = [
            settings.ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "stream=width,height,r_frame_rate,codec_name,pix_fmt",
            "-of",
            "json",
            str(final_video),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        probe_info = json.loads(res.stdout)
        video_stream = next(s for s in probe_info["streams"] if s["codec_name"] == "h264")
        assert video_stream["width"] == 1280
        assert video_stream["height"] == 720
        assert video_stream["pix_fmt"] == "yuv420p"

    def test_job_schema_visual_mode_options(self):
        from src.models.schemas import ConsentRequest, JobCreate

        consent = ConsentRequest(
            authorized=True,
            statement="I consent to AI generation.",
            ai_generated_accepted=True,
            ai_label_accepted=True,
        )

        script = "This is a longer test script with plenty of words to easily fulfill the duration requirement for five seconds."
        # Default is talking_head
        job_default = JobCreate(
            avatar_preset_id="avatar_default",
            voice_preset_id="voice_piper_lessac",
            script=script,
            consent=consent,
            target_duration_seconds=5.0,
        )
        assert job_default.visual_mode == "talking_head"

        # Explicit slideshow
        job_slide = JobCreate(
            avatar_preset_id="avatar_default",
            voice_preset_id="voice_piper_lessac",
            script=script,
            consent=consent,
            target_duration_seconds=5.0,
            visual_mode="slideshow",
            burn_subtitles=True,
        )
        assert job_slide.visual_mode == "slideshow"
        assert job_slide.burn_subtitles is True

        # Invalid mode rejected
        with pytest.raises(Exception):
            JobCreate(
                avatar_preset_id="avatar_default",
                voice_preset_id="voice_piper_lessac",
                script=script,
                consent=consent,
                target_duration_seconds=5.0,
                visual_mode="invalid_mode",
            )

    def test_compose_slideshow_job_end_to_end(self, work_dir):
        from src.models.schemas import CompiledPlan
        from src.services.scene_planner import Scene

        # Create 2 scenes
        scenes = [
            Scene(
                scene_index=0,
                text="The morning light breaks over the quiet forest.",
                start_time=0.0,
                end_time=3.0,
                duration_seconds=3.0,
                image_prompt="morning light forest",
                key_phrase="Morning Light",
                style="cinematic",
            ),
            Scene(
                scene_index=1,
                text="A crystal stream whispers along ancient rocks.",
                start_time=3.0,
                end_time=6.0,
                duration_seconds=3.0,
                image_prompt="crystal stream rocks",
                key_phrase="Crystal Stream",
                style="cinematic",
            ),
        ]

        audios = []
        images = []
        for i, sc in enumerate(scenes):
            ap = work_dir / f"orch_audio_{i}.wav"
            make_tiny_wav(ap, duration_seconds=2.8)
            audios.append(ap)

            ip = work_dir / f"orch_img_{i}.png"
            make_tiny_image(ip, color=(50 + i * 50, 100, 150))
            images.append(ip)

        plan = CompiledPlan(
            job_id="test_orchestrator",
            target_duration_seconds=6.1,  # 2.8 + 2.8 + 0.5 = 6.1s
            duration_source="user_override",
            language="en-US",
            script="Full test script for orchestrator.",
            prompt_original="orchestrator test",
        )

        out_video, out_sub = SlideshowCompositor.compose_slideshow_job(
            job_path=work_dir,
            plan=plan,
            scenes=scenes,
            scene_audio_paths=audios,
            scene_images=images,
            burn_subtitles=True,
            subtitles_enabled=True,
        )

        assert out_video.exists()
        assert out_sub is not None and out_sub.exists()

        v_dur, a_dur, sync_error_ms = SlideshowCompositor.probe_av_sync_error(out_video)
        assert abs(v_dur - 6.1) < 0.25
        assert sync_error_ms < 100.0
