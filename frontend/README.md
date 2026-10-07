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
