/* eslint-env node */
/* global process, Buffer */
// api/tts.js — Vercel serverless function (Node)
// Uses OpenAI TTS to synthesize speech and streams back audio/mpeg.

export const config = {
  api: { bodyParser: false }, // no JSON body; we'll use query params
};

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";
const DEFAULT_VOICE = "alloy"; // try: "alloy", "verse", "aria", "sage"

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const url = new URL(req.url, "http://localhost");
    const text = (url.searchParams.get("text") || "").toString().trim();
    const voice = (url.searchParams.get("voice") || DEFAULT_VOICE).toString();

    if (!text) return res.status(400).json({ error: "Missing `text` query param" });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not configured" });

    // Simple guardrails
    if (text.length > 500) return res.status(413).json({ error: "Text too long (max 500 chars)" });

    const r = await fetch(OPENAI_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",             // OpenAI TTS model
        voice,                      // voice id
        input: text,                // text to speak
        format: "mp3",              // return MP3
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return res.status(500).json({ error: "TTS failed", detail: errText });
    }

    // Stream MP3 back to the browser
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=3600"); // optional caching by CDNs
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(200).send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}
