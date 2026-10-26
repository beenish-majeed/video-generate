# Software & Model Licenses

> **IMPORTANT LEGAL NOTICE:**  
> This project is intended strictly for **personal or educational use** unless every license is reviewed.  
> * **GPL Copyleft Obligations:** `piper-tts` is licensed under **GPL-3.0-or-later**. Distributing this project or combining it into distributed software may carry reciprocal GPL obligations (requiring full source disclosure under GPLv3).  
> * **Non-Commercial Model Restrictions:** Core AI models utilized in this project—specifically **Wav2Lip** (lip-sync synthesis) and **InsightFace** (face detection and alignment checkpoints)—are licensed strictly under **non-commercial research licenses**. Commercial exploitation of these models is strictly prohibited without separate commercial rights from the respective authors.

---

## 1. Machine Learning Models

| Model | Source / Creator | License | Commercial Use Allowed? | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Wav2Lip** (`wav2lip.pth`) | Rudrabha Prajwal et al. (IIIT Hyderabad) | Custom Academic / Non-Commercial Research License | **NO** (Non-commercial only) | Talking-head lip sync model. Strictly restricted to academic and non-commercial research use. |
| **InsightFace Models** (detection & alignment) | DeepInsight / InsightFace team | Non-Commercial Research License | **NO** (Non-commercial research only) | Face detection and landmark analysis checkpoints. Commercial deployment requires proprietary licensing from DeepInsight. |
| **SD-Turbo** (`sd-turbo`) | Stability AI | Stability AI Non-Commercial Research Community License | **NO** (Non-commercial only) | Real-time single-step latent diffusion model for text-to-image. Personal & research use only. |
| **Piper TTS** (`en_US-lessac-medium`) | Rhasspy / Michael Hansen (Lessac dataset) | Open Database License (ODbL) / Public Domain | **YES** (with attribution) | Voice dataset weights. Note: the `piper-tts` runtime library is GPL-3.0-or-later. |
| **faster-whisper** (`tiny`) | SYSTRAN / OpenAI Whisper weights | MIT License / Apache 2.0 | **YES** | CTranslate2-accelerated local transcription engine. |
| **Llama 3.2 3B** (via Ollama) | Meta AI | Llama 3.2 Community License Agreement | **YES** (up to 700M monthly active users) | Local LLM used for intelligent script generation. |

---

## 2. Backend Python Libraries (`requirements.txt`)

| Package | Version | License | Commercial Use Allowed? | Notes |
| :--- | :--- | :--- | :---: | :--- |
| **piper-tts** | 1.2.0 | **GPL-3.0-or-later** | **YES (with copyleft obligations)** | High-performance neural text-to-speech. Reciprocal copyleft applies to distributed derivatives. |
| **insightface** | 0.7.3 | MIT (Library) / Non-Commercial (Models) | **NO (Models are non-commercial)** | Python package wrapper for face analysis models. |
| **fastapi** | 0.115.0 | MIT | **YES** | Web API framework. |
| **uvicorn** | 0.30.6 | BSD-3-Clause | **YES** | ASGI web server. |
| **pydantic** | 2.9.2 | MIT | **YES** | Data validation and schema parsing. |
| **pydantic-settings** | 2.5.2 | MIT | **YES** | Environment settings management. |
| **python-multipart** | 0.0.12 | Apache-2.0 | **YES** | Multipart form and file parser. |
| **aiofiles** | 24.1.0 | Apache-2.0 | **YES** | Asynchronous local file handling. |
| **Pillow** | 13.0.0 | HPND | **YES** | Image manipulation library. |
| **numpy** | 1.26.4 | BSD-3-Clause | **YES** | Scientific and numeric computation. |
| **scipy** | 1.13.1 | BSD-3-Clause | **YES** | Signal processing and scientific computing. |
| **opencv-python-headless** | 4.10.0.84 | Apache-2.0 | **YES** | Computer vision image processing. |
| **librosa** | 0.10.2 | ISC | **YES** | Audio feature analysis. |
| **soundfile** | 0.12.1 | BSD-3-Clause | **YES** | Audio file encoding and decoding. |
| **onnxruntime** | 1.18.1 | MIT | **YES** | Neural model runtime execution. |
| **mediapipe** | 0.10.14 | Apache-2.0 | **YES** | Face mesh and landmark feature detection. |
| **torch** / **torchaudio** / **torchvision** | 2.3.1+cpu | BSD-3-Clause | **YES** | Deep learning framework. |
| **moviepy** | 1.0.3 | MIT | **YES** | Video editing utilities. |
| **ffmpeg-python** | 0.2.0 | Apache-2.0 | **YES** | Python FFmpeg bindings. |
| **pytest** | 8.3.3 | MIT | **YES** | Test framework. |
| **urllib3** | 2.8.0 | MIT | **YES** | HTTP client library. |
| **certifi** | 2026.10.23 | MPL-2.0 | **YES** | Root CA certificate bundle. |
| **setuptools** | 84.2.1 | MIT | **YES** | Packaging utilities. |
| **filelock** | 4.2.4 | Unlicense | **YES** | Concurrency file locking. |
| **PyJWT** | 2.15.1 | MIT | **YES** | JSON Web Token implementation. |

---

## 3. Frontend Libraries (`frontend/package.json`)

| Package | Version | License | Commercial Use Allowed? |
| :--- | :--- | :--- | :---: |
| **react** | 18.2.0 | MIT | **YES** |
| **react-dom** | 18.2.0 | MIT | **YES** |
| **lucide-react** | 0.294.0 | ISC | **YES** |
| **framer-motion** | 10.16.4 | MIT | **YES** |
| **vite** | 4.5.14 | MIT | **YES** |
| **typescript** | 5.2.2 | Apache-2.0 | **YES** |
| **vitest** | 0.34.6 | MIT | **YES** |
| **playwright** | 1.28.0 | Apache-2.0 | **YES** |

---

## 4. Distribution and GPL Obligations

AvatarStudio integrates `piper-tts`, which is licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**.
* If you distribute binary packages, container images, or derived products that bundle `piper-tts`, you may be obligated by the GPLv3 to provide the complete corresponding source code under GPLv3.
* If you wish to deploy AvatarStudio in a proprietary or commercial product without GPLv3 obligations, you must decouple `piper-tts` (e.g. invoke it solely over an isolated network protocol boundary) or substitute it with a permissively licensed TTS engine (such as an Apache 2.0 or MIT TTS library).
* Furthermore, commercial deployment requires replacing `wav2lip.pth` and `insightface` model checkpoints with commercially permissible neural weights.
