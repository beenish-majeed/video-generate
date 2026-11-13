# Memory Studio Frontend

React + TypeScript frontend for AvatarStudio, built with Vite, Framer Motion, Lucide icons, and the Web Audio API.

---

## Setup

Requires **Node.js 18+** (CI runs Node 20).

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
BACKEND_URL=http://127.0.0.1:8000
API_KEY=dev_secret_key_123456789
```

Start the dev server on `http://127.0.0.1:3000`:

```bash
npm run dev
```

Run tests and build:

```bash
npm run test:run
npm run build
```

---

## API Key Handling in Dev vs. Deployment

- Browser code sends requests to `/api/...`, which `vite.config.ts` proxies to `BACKEND_URL`.
- `vite.config.ts` binds to `127.0.0.1` and injects the `X-API-Key` header **only** when the TCP peer is loopback (`127.0.0.1` or `::1`) and `--host` was not passed.
- Do not use the Vite dev server in public or shared deployments; use a real reverse proxy with authentication in front of the backend.

---

## User Flows

- **Text to video (`prompt_first`):** Enter an idea and tone, pick a duration (`30s`–`10m`), optionally edit or regenerate the script, confirm the AI generation notice, wait for rendering, and preview/download the MP4.
- **Picture to video (`custom_media`):** Upload a portrait photo (PNG, JPG, WEBP up to 20 MB), choose the default voice, upload an audio file, or record directly in the browser, pick a duration, confirm rights, and render.
- Extended workflows (`images_audio`, `ai_clips`) exist in code behind `ENABLE_EXTENDED_WORKFLOWS = false` in `src/components/PageTabs.tsx`.

---

## Browser Microphone Recording

- `navigator.mediaDevices.getUserMedia` requires a secure context (`http://localhost`, `http://127.0.0.1`, or `https://`). Plain HTTP over a LAN IP is blocked by browsers.
- `VoiceStep.tsx` enforces a recording length of **3 to 60 seconds** (`src/utils/recordingLimits.ts`), captures mono PCM samples through `AudioContext.createScriptProcessor`, and encodes a 16-bit PCM WAV file in the browser (`src/utils/wavEncoder.ts`) before uploading to `/api/v1/assets/upload`.

---

## Directory Layout

```text
frontend/
├── index.html
├── package.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── index.css
    ├── main.tsx
    ├── api/
    │   ├── client.ts
    │   └── errorMapper.ts
    ├── components/
    │   ├── NotebookShell.tsx
    │   ├── PageTabs.tsx
    │   ├── SoundToggle.tsx
    │   ├── StoryTimeline.tsx
    │   ├── StyleGuide.tsx
    │   ├── steps/
    │   │   ├── ChoiceStep.tsx
    │   │   ├── ClipsUploadStep.tsx
    │   │   ├── ConsentStep.tsx
    │   │   ├── DurationStep.tsx
    │   │   ├── FailedStep.tsx
    │   │   ├── HeroStep.tsx
    │   │   ├── IdeaStep.tsx
    │   │   ├── ImagesAudioStep.tsx
    │   │   ├── LookVoiceStep.tsx
    │   │   ├── PhotoStep.tsx
    │   │   ├── PremiereStep.tsx
    │   │   ├── ScenePlanStep.tsx
    │   │   ├── ScriptStep.tsx
    │   │   ├── VoiceStep.tsx
    │   │   └── WaitingStep.tsx
    │   └── ui/
    │       ├── CursorGlow.tsx
    │       ├── SparkleCanvas.tsx
    │       ├── StoryScrollSection.tsx
    │       └── Toast.tsx
    ├── e2e/
    │   └── happyPath.test.ts
    ├── types/
    │   └── api.ts
    └── utils/
        ├── audioWaveform.ts
        ├── failedJobMapper.ts
        ├── flowStateTransitions.ts
        ├── ideaValidation.ts
        ├── jobStateMapper.ts
        ├── pollingStrategy.ts
        ├── recordingLimits.ts
        ├── scriptWordCount.ts
        ├── soundEffects.ts
        └── wavEncoder.ts
```

---

## Known Limits

- If a `vite dev` run on Windows inside a synced folder like OneDrive fails with `EPERM: rmdir ... node_modules/.vite/deps`, remove `frontend/node_modules/.vite` or move the repo outside the synced folder.
- Script pacing estimates use `150` words per minute (`words_per_minute` from `/v1/durations`) with a 90%–110% word-count window.
- Running jobs execute in-process on the backend and are interrupted if the backend restarts (`FailedStep.tsx` offers retry without clearing uploaded assets/script).
