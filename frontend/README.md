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

## 📖 Welcome Page & The Choice Screen

The application opens on a clean sketchbook **Welcome page** featuring an original illustrated hero scene, a warm headline, a concise explanation, and a single **"Get started"** button.

Clicking "Get started" transitions to the **Choice screen**, which presents two creative paths side by side on wide screens and stacked on narrow viewports (320px to 2560px):

### 1. "Use my own photo and voice" Path (`custom_media`)
Designed for creators who bring their own media files or record live audio:
1. **Photo**: Upload portrait photograph (JPEG, PNG, WEBP, up to 10MB) pinned to canvas.
2. **Voice**: Upload audio file (MP3, WAV, M4A, WEBM, up to 20MB) or record directly using the microphone.
3. **Duration**: Select video length from dynamic presets loaded from the backend (e.g. 5s, 30s, 2m, 5m, 10m).
4. **Script**: Draft narrative story matching duration guidelines (150 WPM pacing with visual feedback).
5. **Rights / Consent**: Review and check all 3 legal attestations (face permission, voice ownership, synthesis authorization).
6. **Waiting Room**: Real-time animated progress tracking across neural synthesis stages.
7. **Premiere**: Theater preview screening with direct MP4 download.

### 2. "Start with a prompt" Path (`prompt_first`)
Designed for idea-first generation starting directly from a narrative concept:
1. **Idea**: Enter a creative concept (up to 1,000 characters with live counter), choose an example starter chip, and select narrator tone (`friendly`, `professional`, `storytelling`, `educational`).
2. **Length**: Choose duration preset (`30s`, `1m`, `2m`, `3m`, `5m`, `10m`) based on calibrated speech timing.
3. **Look & Voice**: Select character appearance from curated avatar presets (taped polaroid style) and narrator voice model from Piper presets.
4. **Script**: Generates spoken narrative script via backend LLM (`POST /v1/scripts/generate`) upon arrival with a calm story-style loading screen (never fake percentages). Allows editing with live word counter, 90%–110% duration calibration check, and "Write it again" AI regeneration with edit-protection confirmation.
5. **Rights / Consent**: Transparent AI disclosure confirmation (accepting AI generation and AI transparency label, without claiming ownership of preset assets).
6. **Waiting Room**: Real-time progress monitoring through neural synthesis stages.
7. **Premiere**: Theater preview screening with direct MP4 download.

> [!NOTE]
> **Status**: The "Start with a prompt" path is fully active (`ENABLE_PROMPT_PATH = true` in `src/components/steps/ChoiceStep.tsx`) and backed by safe allowlisted avatar/voice presets and the backend script writer service.

### 🧭 Navigation & Step Tabs
* **Hidden Tabs on Welcome & Choice**: The top step tab bar is hidden on the welcome and choice screens.
* **Isolated Path Steps**: Once a path begins, the tab bar displays only the steps belonging to that specific journey (7 tabs for each creative path).
* **Persistent State**: Navigating backwards (Choice -> Welcome, or between steps) preserves all user-entered scripts, ideas, prompts, presets, and asset IDs across the entire session.


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

## 🎭 Running Playwright Tests & Fake Microphone Flags

The frontend test suite includes end-to-end browser specifications validating the journey flow, accessibility, and audio/video interactions.

### 1. Executing Tests
To run the Playwright test suite:

```bash
cd frontend

# Run all Playwright test specifications
npx playwright test

# Run specific happy path test
npx playwright test e2e/happyPath.spec.ts

# Run with interactive UI mode
npx playwright test --ui

# Run in headed browser mode
npx playwright test --headed
```

### 2. Fake Microphone Flags for Automated Runs
Headless environments, CI pipelines, and automated test runners lack physical audio microphones and cannot display interactive OS permission dialogs. When testing the live voice recording feature with Playwright, Chromium must be launched with synthetic media stream arguments and granted context permission:

```typescript
import { chromium } from 'playwright';

// Launch Chromium with synthetic media input flags
const browser = await chromium.launch({
  args: [
    // Generates synthetic media (a clean beep tone) instead of failing on missing hardware
    '--use-fake-device-for-media-stream',
    // Automatically grants the browser getUserMedia permission without showing UI modal
    '--use-fake-ui-for-media-stream',
  ],
});

// Grant browser context permission for the microphone
const context = await browser.newContext({
  permissions: ['microphone'],
});

const page = await context.newPage();
```

**Why both flags are required:**
* `--use-fake-device-for-media-stream`: Supplies a synthetic audio stream to `navigator.mediaDevices.getUserMedia({ audio: true })`. Without this, headless browsers fail immediately with `NotFoundError: Requested device not found`.
* `--use-fake-ui-for-media-stream`: Bypasses the browser's "Allow microphone access?" permission prompt, allowing immediate test execution.
* `permissions: ['microphone']`: Bypasses Chromium's per-origin security permission gate.

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

1. **Render Time (~3.7x Video Duration)**:
   * Neural audio synthesis, segment scheduling, and neural lip-sync generation take approximately **3.7 times** the chosen video duration.
   * Real-world rendering benchmarks:
     * **5-second video**: ~18 seconds
     * **30-second video**: ~110 seconds (~1.8 minutes)
     * **2-minute video**: ~7.4 minutes
     * **5-minute video**: ~18.5 minutes
     * **10-minute video**: ~37 minutes
   * The Duration preset cards and Waiting Room progress indicator both display realistic estimates derived from this multiplier.

2. **In-Process Job Execution & Server Restarts**:
   * Video generation jobs run asynchronously within the active backend server process (`ThreadPoolExecutor` thread pool).
   * There is no external task queue (such as Celery or Redis). If the backend server (`uvicorn`) restarts or stops during rendering, in-flight jobs cannot resume.
   * Upon server startup, an automated recovery routine scans the SQLite jobs table and transitions all interrupted jobs to `FAILED` with: *"Job was interrupted by a server restart."* The frontend displays a recovery card allowing users to retry without losing their script or assets.

3. **Script Length Must Match Chosen Duration**:
   * Speech pacing is calculated based on a conversational benchmark of **150 words per minute** (retrieved from `GET /v1/durations`).
   * The script must be long enough to produce speech within a strict **90% to 110% tolerance window** of the target video duration.
   * Example script requirements:
     * **5s preset**: ~11 to 14 words
     * **30s preset**: ~68 to 83 words (~75 words optimal)
     * **2m preset**: ~270 to 330 words
   * If a script is too short or too long, the "Continue to Rights" button is disabled with real-time word count feedback, and backend synthesis enforces the 10% audio duration tolerance.

4. **No Video Retention or Auto-Cleanup Policy**:
   * Rendered video files (`final_video.mp4`), audio stems, subtitle files (`subtitles.vtt`), and uploaded assets remain saved in local filesystem storage (`storage/jobs/<job_id>/` and `storage/assets/`).
   * The system does not run an automated background retention or pruning policy. Administrators must manually clean up disk space or manage the `storage/` directory.


---

## 🎨 Motion System & Animation Architecture

Memory Studio features a cohesive **Dreamy Pastel** animation and interaction system designed to feel soft, airy, and responsive while respecting device performance and user accessibility preferences.

### 1. Motion Principles
* **Calm & Tactile**: Subtle scale, gentle parallax drift, and spring-eased responses rather than flashy or abrupt motion.
* **60 FPS Performance**: Animations strictly target GPU-accelerated compositing properties (`transform` and `opacity`) to eliminate layout thrash and reflows.
* **Tab-Aware Pause**: Ambient pulses, floating bubbles, and continuous gradient drifts pause automatically when `document.visibilityState === 'hidden'`, preserving battery and CPU.
* **Zero Input Delay**: Animations never block clicks, disable buttons artificially, or prevent rapid form navigation.

### 2. Tokens, Durations & Easing Curves
Centralized design tokens in `src/index.css` define shared timing and motion curves:
* **Deceleration Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (out-expo / soft spring) for step entrances, modal reveals, and cards.
* **Ambient Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` (smooth in-out) for slow floating shapes and background gradient shifts.
* **Standard Durations**:
  * Micro-interactions (hover, active, focus): `150ms`
  * Card / Dialog scale-in: `250ms - 350ms`
  * Directional page slide & blur-in: `350ms`
  * Ambient background loop: `18s - 24s`

### 3. Reduced Motion (`prefers-reduced-motion`)
Full accessibility support for users sensitive to motion:
* **Component-Level Hooks**: Components query `useReducedMotion()`. When enabled, all parallax, tilt, confetti trajectories, and spatial translations (`x`, `y`, `scale`, `rotate`) are disabled, falling back to simple, non-moving opacity cross-fades.
* **Global CSS Overrides**: Global media query in `src/index.css` sets `animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;` for all elements under `prefers-reduced-motion: reduce`.
* **Zero Functional Loss**: Every step, form validation, file upload, audio recorder, and download action remains 100% operational under reduced motion.

### 4. Small-Screen & Low-Power Performance
* **Dynamic Blur Scaling**: Background and card backdrop blurs scale down from 80px / 24px to 40px / 8px on screens below 768px (`@media (max-width: 768px)`).
* **Particle Count Reduction**: Decorative particles and confetti are pruned on mobile viewports (< 640px) to conserve GPU memory bandwidth.

### 5. Bundle Footprint
* Total JavaScript gzip growth across all motion features and steps: **~2.41 kB gzip** (87.57 kB baseline -> 89.98 kB final).
* Total CSS gzip growth: **~2.04 kB gzip** (2.95 kB baseline -> 4.99 kB final).
* Total bundle impact is well below the 30 kB gzip budget.
