# English for Bee

A lightweight English‑practice web app tailored for Thai speakers.

## Features

- Mobile‑first UI (Tailwind + DaisyUI via CDN)
- Text‑to‑Speech voice picker (Web Speech API)
- Microphone practice via **Whisper** (serverless `/api/transcribe`)
- Tracks local progress (XP, words completed); more lessons coming

## Quick Start (Codespaces or local Node 20+)

```bash
npm install
npm run dev
```

Open the forwarded port (5173). If the microphone doesn’t work, open the app in a full browser tab (HTTPS) and allow microphone access.

### Deployment (Vercel)

- Import the repository.
- Framework: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.
- Every push to the `main` branch automatically deploys.

### Environment Variables (Vercel)

Set the following environment variable in **Project → Settings → Environment Variables**:

- `OPENAI_API_KEY=<your key>` – used by `/api/transcribe` (do not commit keys).

### API

- `POST /api/transcribe`  
  - **Body:** raw audio (audio/webm) from `MediaRecorder`.  
  - **Returns:** `{ "text": "..." }` (Whisper transcription).  
  - Implemented in `api/transcribe.js`.

### Troubleshooting

- **Microphone blocked:** click the lock icon in the URL bar → **Microphone**: Allow → pick device → hard reload.  
- **No `/api/transcribe` request:** ensure the UI calls `fetch('/api/transcribe', { method: 'POST', body: blob })`.  
- **500 from `/api/transcribe`:** check the Vercel env var `OPENAI_API_KEY`; keep clips short (2–5 s).

### Roadmap

- Home dashboard (XP, lessons, daily streak).
- More Thai‑focused lessons (articles, plurals, tenses, minimal pairs).
- Pronunciation scoring (similarity, per‑sound hints).
- Flashcards & mini‑games.
- Paragraph reading & correction.
