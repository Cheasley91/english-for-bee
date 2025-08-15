# English for Bee

A lightweight English‑practice web app tailored for Thai speakers.

## Features

- Mobile‑first UI (Tailwind + DaisyUI via CDN)
- Text‑to‑Speech voice picker (Web Speech API)
- Microphone practice via **Whisper** (serverless `/api/transcribe`)
- Tracks progress locally or in Firestore under a logged-in user account
- Thai translations for lesson items (best effort)
- Daily rotating tip on home and lesson screens
- Login and registration screens (no guest mode)

### Lessons & Progress

- Completed lessons are stored per user (Firestore or local storage).
- The **Lessons** tab lists prior lessons with a Repeat button to practice again.
- XP is awarded only on the first completion of a lesson; repeats give no XP.
- Level increases with total XP using a superlinear curve (100, 150, 225, ...).
- Daily streak counts consecutive days with a completed lesson (America/New_York timezone).

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

### Firebase (optional)

Set `VITE_USE_FIREBASE=true` and the `VITE_FB_*` config values to enable Firestore persistence. Authentication uses email/password and sessions persist via `browserLocalPersistence`.

### Daily Tips

Tips rotate automatically by calendar day and appear on the home and lesson screens—no setup required.

Thai translations are provided for each lesson item when available and will improve over time.

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
