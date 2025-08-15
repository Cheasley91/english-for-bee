/* eslint-env node */
/* global process */
// api/transcribe.js — Vercel serverless function (Node)
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    // collect raw request body (audio/webm)
    const chunks = [];
    for await (const ch of req) chunks.push(ch);
    const blob = new Blob(chunks, { type: "audio/webm" });

    const form = new FormData();
    form.append("file", blob, "audio.webm");
    form.append("model", "whisper-1");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });

    if (!r.ok) return res.status(500).json({ error: await r.text() });
    const data = await r.json(); // { text: "..." }
    res.status(200).json({ text: data.text || "" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
