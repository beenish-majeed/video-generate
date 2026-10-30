# Avatar Pipeline — Colab AI Video Clips Workflow

This directory provides the companion Google Colab notebook and helper utilities for generating AI video clips in the **"AI scene clips"** visual mode.

> **Hardware & Environment Note:**
> Text-to-video generation requires a GPU with at least 15 GB of VRAM (e.g. Google Colab T4 GPU, which is available on the free tier). Model inference cannot be executed on local CPU environments and is **not verified** locally. The helper scripts and archiving tools are fully CPU-compatible and unit-tested.

---

## Workflow Guide

### 1. Export Scene Plan
1. In the Avatar Pipeline web application, select the **AI scene clips** visual mode.
2. Enter your topic or paste your script, select your pacing and visual style (cinematic, watercolor, flat illustration, photo).
3. On the **Scene Plan** step, review your generated scenes and click **Download Scene Plan (`scene_plan.json`)**.
4. You can also download or copy `notebooks/ai_clips_colab.ipynb` and `notebooks/clip_helpers.py`.

### 2. Run Generation on Google Colab
1. Open [Google Colab](https://colab.research.google.com/) and upload `ai_clips_colab.ipynb`.
2. Navigate to **Runtime -> Change runtime type** and ensure **T4 GPU** is selected.
3. Upload `scene_plan.json` and `clip_helpers.py` to the Colab session files.
4. Execute the cells sequentially:
   - **GPU Check**: Verifies that a CUDA-compatible T4 GPU is attached.
   - **Dependencies**: Installs pinned versions of `diffusers`, `transformers`, `accelerate`, and `imageio-ffmpeg`.
   - **Load Scene Plan**: Parses scene prompts, negative prompts, and target durations.
   - **Model Initialization**: Loads **LTX-Video** (`Lightricks/LTX-Video`) with `torch.bfloat16` and model CPU offload for optimal 15GB VRAM usage (or alternatively **Wan 2.1 1.3B**).
   - **Test Clip First**: Renders only `scene_001.mp4` first so you can inspect quality and speed before running the entire batch.
   - **Batch Generation**: Iterates through remaining scenes with **resume support** (if a run disconnects, re-running skips already generated clips).
   - **Packaging & Download**: Packages all `scene_*.mp4` clips into `ai_clips.zip` and triggers automatic browser download.

### 3. Import Clips into Avatar Pipeline
1. Return to the Avatar Pipeline web application.
2. Advance to the **Upload Clips** step.
3. Upload your generated `.mp4` video clips (or drag and drop them).
4. The application automatically maps `scene_001.mp4`, `scene_002.mp4` to their corresponding scenes, verifies codec and resolution, and allows reordering or replacing clips.
5. Choose your voice (Piper TTS or custom audio), music preset, confirm rights, and click **Create Video**.

---

## Open Models & Verification Table

| Model & Call | Official Source Checked | Verification Status | Match / Constraints Note |
| :--- | :--- | :---: | :--- |
| `LTXPipeline.from_pretrained("Lightricks/LTX-Video")` | Hugging Face Diffusers Docs / Model Card | MATCH | Loaded in `torch.bfloat16` with `enable_model_cpu_offload()` for 15GB VRAM compatibility. |
| `pipeline(prompt, width, height, num_frames, ...)` (LTX) | Diffusers `LTXPipeline` Specification | MATCH (Fixed) | Requires `width` and `height` divisible by 32 (704x480), and `num_frames` following $8n + 1$ (25..121). |
| `WanPipeline.from_pretrained("Wan-AI/Wan2.1-T2V-1.3B-Diffusers")` | Wan-AI Diffusers Model Card | MATCH (Fixed) | Diffusers format repository ID with `WanPipeline` class in `torch.bfloat16`. |
| GPU Inference Execution (`!nvidia-smi`, `pipeline(...)`) | Local Execution Check | UNVERIFIED | Local system lacks CUDA GPU; must be executed inside Google Colab T4 runtime. |

### Licensing
- **LTX-Video** (`Lightricks/LTX-Video`): check the model card on Hugging Face.
- **Wan 2.1 1.3B** (`Wan-AI/Wan2.1-T2V-1.3B-Diffusers`): check the model card on Hugging Face.
- **Zero Third-Party Cost**: No paid API tokens, no subscriptions, no cloud tunnels (ngrok/localtunnel), and no external webhooks.
- **Complete Privacy**: Videos and prompts stay entirely within your ephemeral Colab session.
