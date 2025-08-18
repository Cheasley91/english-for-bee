/* eslint-env node */
/* global process */
// api/transcribe.js — Vercel serverless function (Node)
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY)
      return res.status(500).json({ error: "Server misconfigured" });
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

    if (!r.ok) {
      console.error("openai upstream", r.status);
      return res.status(502).json({ error: "Upstream error", status: r.status });
    }
    const data = await r.json(); // { text: "..." }
    res.status(200).json({ text: data.text || "" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}
