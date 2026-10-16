# Software & Model Licenses

> **IMPORTANT NOTICE:**  
> This project is intended strictly for **personal or educational use** out-of-the-box. Several core AI models utilized in this project (specifically **Wav2Lip** and **SD-Turbo**) are licensed under non-commercial licenses. Anyone wishing to use this software commercially must audit every model and dependency, and replace non-commercial checkpoints with commercially permissible alternatives.

---

## 1. Machine Learning Models

| Model | Source / Creator | License | Commercial Use Allowed? | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Wav2Lip** (`wav2lip.pth`) | Rudrabha Prajwal et al. (IIIT Hyderabad) | Custom Academic / Non-Commercial Research License | **NO** (Non-commercial only) | Talking-head lip sync model. Strictly prohibited from commercial exploitation without explicit rights holder licensing. |
| **SD-Turbo** (`sd-turbo`) | Stability AI | Stability AI Non-Commercial Research Community License | **NO** (Non-commercial only) | Real-time single-step latent diffusion model for text-to-image. Personal & research use only. |
| **Piper TTS** (`en_US-lessac-medium`) | Rhasspy / Michael Hansen (Lessac dataset) | Open Database License (ODbL) / Public Domain | **YES** (with attribution) | Local fast offline neural speech synthesis. |
| **faster-whisper** (`tiny`) | SYSTRAN / OpenAI Whisper weights | MIT License / Apache 2.0 | **YES** | CTranslate2-accelerated local transcription engine. |
| **Llama 3.2 3B** (via Ollama) | Meta AI | Llama 3.2 Community License Agreement | **YES** (up to 700M monthly active users) | Local LLM used for intelligent script generation. |

---

## 2. Backend Python Libraries (`requirements.txt`)

| Package | Version | License | Commercial Use Allowed? |
| :--- | :--- | :--- | :---: |
| **fastapi** | 0.115.0 | MIT | **YES** |
| **uvicorn** | 0.30.6 | BSD-3-Clause | **YES** |
| **pydantic** | 2.9.2 | MIT | **YES** |
| **pydantic-settings** | 2.5.2 | MIT | **YES** |
| **python-multipart** | 0.0.12 | Apache-2.0 | **YES** |
| **aiofiles** | 24.1.0 | Apache-2.0 | **YES** |
| **Pillow** | 10.4.0 | HPND | **YES** |
| **numpy** | 1.26.4 | BSD-3-Clause | **YES** |
| **scipy** | 1.13.1 | BSD-3-Clause | **YES** |
| **opencv-python-headless** | 4.10.0.84 | Apache-2.0 | **YES** |
| **librosa** | 0.10.2 | ISC | **YES** |
| **soundfile** | 0.12.1 | BSD-3-Clause | **YES** |
| **onnxruntime** | 1.18.1 | MIT | **YES** |
| **mediapipe** | 0.10.14 | Apache-2.0 | **YES** |
| **piper-tts** | 1.2.0 | MIT | **YES** |
| **torch** / **torchaudio** / **torchvision** | 2.3.1+cpu | BSD-3-Clause | **YES** |
| **insightface** | 0.7.3 | MIT / Non-Commercial (Model dependent) | **NO** (Models are non-commercial) |
| **moviepy** | 1.0.3 | MIT | **YES** |
| **ffmpeg-python** | 0.2.0 | Apache-2.0 | **YES** |
| **pytest** | 8.3.3 | MIT | **YES** |

---

## 3. Frontend Libraries (`frontend/package.json`)

| Package | Version | License | Commercial Use Allowed? |
| :--- | :--- | :--- | :---: |
| **react** | 18.2.0 | MIT | **YES** |
| **react-dom** | 18.2.0 | MIT | **YES** |
| **lucide-react** | 0.294.0 | ISC | **YES** |
| **framer-motion** | 10.16.4 | MIT | **YES** |
| **vite** | 4.5.2 | MIT | **YES** |
| **typescript** | 5.2.2 | Apache-2.0 | **YES** |
| **vitest** | 0.34.6 | MIT | **YES** |
| **playwright** | 1.28.0 | Apache-2.0 | **YES** |

---

## 4. System Tools

| Tool | License | Commercial Use Allowed? | Notes |
| :--- | :--- | :---: | :--- |
| **FFmpeg** / **FFprobe** | LGPL v2.1+ / GPL v2+ (depending on build flags) | **YES** | Invoked strictly as an external subprocess / CLI binary. |
