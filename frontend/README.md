# Memory Studio — Video Generation Frontend UI

A handcrafted sketchbook interface for personal portrait & voice video memory generation. Built with React, Vite, TypeScript, Framer Motion, Lucide Icons, and Web Audio API.

---

## 🚀 Quick Start Guide

### 1. Installation
Ensure you have **Node.js (v18+)** installed. Navigate to the `frontend` folder and install dependencies:

```bash
cd frontend
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

**Environment Variables Configuration (`.env`)**:

```env
# Backend API Base URL
BACKEND_URL=http://127.0.0.1:8000

# Secret API Key (NEVER exposed to the browser client)
API_KEY=YOUR_SECRET_API_KEY_HERE
```

### 3. Running Development Server
Start the Vite development server on `http://localhost:3000`:

```bash
npm run dev
```

### 4. Running Tests & Production Build
```bash
# Run unit & integration tests
npm test

# Build for production
npm run build
```

---

## 🔒 Security Architecture (API Key Proxy Protection)

* **Vite Node Proxy**: Requests from client browser code target relative paths like `/api/v1/jobs`.
* **Server-Side Header Injection**: The Vite development server proxy (`vite.config.ts`) intercepts `/api/*` traffic server-side and injects the `X-API-Key` header using Node process environment variables (`process.env.API_KEY`).
* **Zero Client Exposure**: Client JavaScript bundles (`dist/*.js`) and network request headers in the browser developer tools **never** contain or transmit `API_KEY`.

To target a remote backend server, set `BACKEND_URL` in `.env`:
```env
BACKEND_URL=https://api.yourdomain.com
```

---

## 📖 Welcome Page & The Two Creation Paths

The application opens on a sketchbook welcome screen featuring a warm illustrated hero scene, an optional creative prompt input with quick suggestion chips, and two distinct path selection cards:

### 1. "Upload Photo & Voice" Path (`custom_media`)
Designed for creators who bring their own media files or record live audio:
1. **Welcome**: Set creative prompt or mood.
2. **Photo**: Upload portrait photograph (JPEG, PNG, WEBP, up to 10MB) pinned to canvas.
3. **Voice**: Upload audio file (MP3, WAV, M4A, WEBM, up to 20MB) or record directly using the microphone.
4. **Duration**: Select video length from dynamic presets loaded from the backend (e.g. 5s, 30s, 2m, 5m, 10m).
5. **Script**: Draft narrative story matching duration guidelines (150 WPM pacing with visual feedback).
6. **Rights / Consent**: Review and check all 3 legal attestations (face permission, voice ownership, synthesis authorization).
7. **Waiting Room**: Real-time animated progress tracking across neural synthesis stages.
8. **Premiere**: Theater preview screening with direct MP4 download.

### 2. "Start with Prompt" Path (`prompt_first`)
Designed for idea-first generation starting directly from a narrative concept:
1. **Welcome**: Enter creative story prompt.
2. **Duration**: Select target video duration preset.
3. **Script**: Enter narrative script fitted to the chosen duration bounds.
4. **Rights / Consent**: Affirm ownership and synthesis consent.
5. **Waiting Room**: Real-time progress monitoring.
6. **Premiere**: Video player preview and download.

*Note on prompt path backend support*: The frontend supplies studio default identifiers (`default-studio-photo` and `default-studio-voice`) in prompt-first mode. If the backend does not have pre-seeded default studio assets on disk, job submission returns an explanatory error card informing the user to supply photo and voice assets.

Throughout both paths, clickable notebook binder tabs at the top allow inspecting completed stages and jumping back to prior steps without losing entered input.

---

## 🎙️ Live Voice Recording & Hardware Requirements

The Voice step supports both pre-recorded file uploads (MP3, WAV, M4A, WEBM up to 20MB) and direct in-browser microphone capture:

### 1. Secure Contexts (HTTPS or Localhost Only)
Browser security policies (`navigator.mediaDevices.getUserMedia`) strictly require a **Secure Context**:
* Works automatically when accessing via `http://localhost:3000` or `http://127.0.0.1:3000`.
* Plain HTTP access over local network IPs (e.g. `http://192.168.1.50:3000`) will be blocked by modern browsers, showing a descriptive microphone security warning.

### 2. Testing on a Mobile Phone
To test live microphone recording on a smartphone over your local network:
* **Option A (Recommended — Secure Tunnel)**: Use an HTTPS tunnel to forward your local port:
  ```bash
  # Using cloudflared
  cloudflared tunnel --url http://localhost:3000

  # Or using ngrok
  ngrok http 3000
  ```
  Open the resulting `https://*.trycloudflare.com` or `https://*.ngrok-free.app` URL on your phone browser.
* **Option B (Vite HTTPS)**: Configure HTTPS in Vite (e.g., using `@vitejs/plugin-basic-ssl` or local certificates via `mkcert`).
* **Option C (Chrome Android Flag)**: In Chrome mobile, navigate to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add your host URL (e.g., `http://192.168.1.50:3000`), enable it, and relaunch.

### 3. Recording Duration Limits
* **Minimum Length**: **3 seconds** (`MIN_RECORD_SECONDS = 3`). Shorter recordings display a helpful `"too short"` alert prompting you to speak at least 3 seconds of reference audio.
* **Maximum Length**: **60 seconds** (`MAX_RECORD_SECONDS = 60`). The live recorder displays an elapsed counter and dynamic audio visualizer bars, automatically stopping at the 60-second limit.

### 4. Client-Side WAV Conversion
Different browsers and operating systems record raw audio streams in diverse container formats (such as Opus in `audio/webm` or AAC in `audio/mp4`).
* Before sending to the backend, the frontend captures audio chunks into a `Blob`, decodes the PCM sample data with the browser's `AudioContext`, and runs an in-browser encoder (`src/utils/wavEncoder.ts`).
* The encoder outputs a clean, standard **16-bit PCM WAV file** (`audio/wav`) directly in the client, ensuring consistent zero-transcoding compatibility with the backend synthesis pipeline.

---

## 📱 Supported Screen Sizes & Responsive Layouts

The UI is constructed with responsive fluid typography (`clamp()`), flexbox/grid containers, and CSS custom properties that scale from **320px smartphones up to 2560px ultra-wide monitors**:

### 1. Small Phones (320px – 480px)
* **Full-Bleed Notebook**: Borders and outer margins collapse to maximize screen estate without clipping content.
* **Safe Area Insets**: Explicit `env(safe-area-inset-*)` padding protects navigation buttons and headers from device notches, camera punch-holes, and home indicator bars.
* **Full-Width Stacked Touch Targets**: Step footers stack buttons vertically (`flex-direction: column-reverse`) with accessible `min-height: 44px` touch targets.
* **Single-Column Presets**: The duration cards grid collapses into a single accessible column (`grid-template-columns: 1fr`).
* **Horizontal Touch Tabs**: The binder tabs scroll smoothly with hidden scrollbars for natural swiping.

### 2. Large Phones & Tablets (481px – 768px)
* **Two-Column Presets**: Duration cards arrange into a 2-column grid.
* **Proportional Scaling**: Step containers expand comfortably with dynamic gap spacing (`clamp(0.85rem, 3vw, 1.25rem)`).

### 3. Desktop Displays (769px – 1440px)
* **Floating Notebook Page**: The sketchbook is centered against the dark charcoal canvas with paper drop shadows (`--shadow-notebook`) and folded-page corners.
* **Standard Container Bounds**: Notebook container width scales dynamically via `clamp(740px, 80vw, 1300px)`.

### 4. Ultra-Wide Displays (1600px – 2560px)
* **Restrained Typography & Proportions**: Controlled by `@media (min-width: 1600px)`. The notebook caps its max width at `clamp(1100px, 65vw, 1500px)`, preventing paragraphs, textareas, or controls from stretching excessively across 2K or 4K monitors.

### 5. Landscape Mobile Orientation
* **Dynamic Viewport Height (`dvh`)**: Containers use `min-height: 100dvh` and fluid vertical padding (`clamp(0.5rem, 2dvh, 1.5rem)`), ensuring header and controls remain visible on short horizontal screens.
* **Internal Page Scrolling**: Step containers maintain `overflow-y: auto` so all inputs and buttons are reachable when virtual mobile keyboards expand horizontally.

---

## 📁 Directory & File Architecture

```
frontend/
├── e2e/
│   └── happyPath.spec.ts        # Playwright E2E test spec
├── src/
│   ├── api/
│   │   ├── client.ts            # Typed API client with upload progress
│   │   └── errorMapper.ts       # Human error mapper (400, 401, 413, 422, 5xx)
│   ├── components/
│   │   ├── steps/               # Step view components (Hero, Photo, Voice, Duration, Script, Consent, Waiting, Premiere, Failed)
│   │   ├── Doodles.tsx          # Self-drawing SVG stroke animations
│   │   ├── NotebookShell.tsx    # Graph paper notebook container wrapper
│   │   ├── PageTabs.tsx         # Hand-labeled binder tabs & step indicators
│   │   ├── SoundToggle.tsx      # Persistent Web Audio sound toggle
│   │   ├── Sticker.tsx          # Rotatable paper sticker badges
│   │   └── Tape.tsx             # Translucent paper tape strips
│   ├── types/
│   │   └── api.ts               # TypeScript schemas matching FastAPI contracts
│   ├── utils/
│   │   ├── audioWaveform.ts     # Web Audio API peak extractor & duration formatter
│   │   ├── failedJobMapper.ts   # Backend failure explanation mapper
│   │   ├── jobStateMapper.ts    # Pure state-to-story mapper (13 backend job states)
│   │   ├── pollingStrategy.ts   # Adaptive backoff polling & terminal detector
│   │   ├── scriptWordCount.ts   # Pure word count calculation (90%–110% target bounds)
│   │   └── soundEffects.ts      # Web Audio sound synthesizer (0kB asset overhead)
│   ├── App.tsx                  # Journey state machine with lazy loading
│   ├── index.css                # Design tokens, CSS variables, responsive rules
│   └── main.tsx                 # React DOM root mounting
├── index.html                   # HTML template & web fonts
├── vite.config.ts               # Vite server proxy & build configuration
└── package.json                 # Project dependencies & scripts
```

---

## ⚠️ Known Limits

1. **Render Time Estimator**: Video compilation and audio lip-sync rendering take approximately **3.7 times** the video length. For example, a 30-second preset takes ~110 seconds, while a 5-minute video takes ~18 minutes to render.
2. **In-Memory Job State**: Rendering jobs execute within the active backend process. If the backend server restarts during rendering, active jobs transition to `FAILED` status with an error explaining the restart.
3. **Script Word Count Pacing**: Spoken audio duration must fit within a 90%–110% tolerance window of the target duration (at ~150 words per minute). Scripts below 90% or above 110% are blocked on the client and rejected by backend synthesis.
4. **No Video Retention Policy**: Generated video assets and download proxy streams are stored in local job storage. There is no automated retention/cleanup policy for old job artifacts.
