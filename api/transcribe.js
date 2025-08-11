// api/transcribe.js
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    // Read raw body into a Blob
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const blob = new Blob(chunks, { type: "audio/webm" });

    const form = new FormData();
    form.append("file", blob, "audio.webm");
    form.append("model", "whisper-1"); // priced per minute
    // optional: form.append("language", "en");
    // optional: form.append("prompt", "lesson context...");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });

    if (!r.ok) return res.status(500).json({ error: await r.text() });
    const data = await r.json(); // { text: "..." }
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
