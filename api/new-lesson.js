// api/new-lesson.js
export const maxDuration = 60; // allow up to 60s on Vercel

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { level = "beginner", count = 8, topic } = req.body ?? {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    // Abort after 25s so we can report a clean error (not 502)
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort("OpenAI timeout"), 25_000);

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // or whatever your code expects—make sure it matches
        messages: [
          { role: "system", content: "You generate ESL lessons for Thai speakers." },
          { role: "user", content: `Level: ${level}. Count: ${count}. Topic: ${topic ?? "general"}.` }
        ],
        temperature: 0.7,
      }),
      signal: ctl.signal,
    });

    clearTimeout(t);

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("OpenAI error:", r.status, detail);
      return res.status(502).json({ error: `OpenAI ${r.status}`, detail });
    }

    const data = await r.json();
    // TODO: parse data.choices[0].message.content into a lesson object:
    const lesson = { raw: data.choices?.[0]?.message?.content ?? "" };

    return res.status(200).json({ lesson });
  } catch (err) {
    console.error("new-lesson exception:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
