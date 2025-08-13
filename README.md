# English for Bee

A lightweight English-practice web app tailored for Thai speakers.

## Features
- Mobile-first UI (Tailwind + DaisyUI via CDN)
- Text-to-Speech voice picker (Web Speech API)
- Mic practice via **Whisper** (serverless `/api/transcribe`)
- Local progress (XP, words done); more lessons coming

## Quick Start (Codespaces or local Node 20+)
```bash
npm install
npm run dev


Open the forwarded port (5173). If the mic doesn’t work, open in a full browser tab (HTTPS) and allow microphone.

Deploy (Vercel)
Import repo → Framework: Vite → Build: npm run build → Output: dist

Every git push to main auto-deploys

Environment Variables (Vercel)
Set in Project → Settings → Environment Variables:

ini
Copy
Edit
OPENAI_API_KEY=...     # used by /api/transcribe
(Do not commit keys.)

API
POST /api/transcribe
Body: raw audio (audio/webm) from MediaRecorder

Returns: { "text": "..." } (Whisper transcription)

Implemented in api/transcribe.js

Troubleshooting
Mic blocked: Click the lock icon (URL bar) → Microphone: Allow → pick device → hard reload.

No /api/transcribe request: Ensure the UI calls fetch('/api/transcribe', { method: 'POST', body: blob }).

500 from /api/transcribe: Check Vercel env var OPENAI_API_KEY; keep clips short (2–5s).

Roadmap
Home dashboard (XP, lessons, daily streak)

More Thai-focused lessons (articles, plurals, tenses, minimal pairs)

Pronunciation scoring (similarity, per-sound hints)

Flashcards & mini-games

Paragraph reading & correction