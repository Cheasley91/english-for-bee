/* eslint-env node */
/* global process */
export const maxDuration = 60;

function normalizeLesson(lesson) {
  if (!lesson || typeof lesson !== "object") return [];
  const acc = [];
  if (lesson.title) acc.push(String(lesson.title));
  if (Array.isArray(lesson.items)) {
    for (const it of lesson.items) {
      if (!it) continue;
      if (it.type === "text" && it.content) acc.push(String(it.content));
      if ((it.type === "word" || it.type === "phrase") && it.term) acc.push(String(it.term));
    }
  }
  if (lesson.meta) {
    if (lesson.meta.level) acc.push(String(lesson.meta.level));
    if (lesson.meta.topic) acc.push(String(lesson.meta.topic));
  }
  return acc
    .map((s) => s.toLowerCase().trim().replace(/\s+/g, " "))
    .sort();
}

function fingerprint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function lessonFingerprint(lesson) {
  return fingerprint(JSON.stringify(normalizeLesson(lesson)));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { level = "beginner", count = 8, topic = "general", avoidTerms = [] } = req.body ?? {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort("timeout"), 25_000);
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You generate compact ESL lessons for Thai learners. Output JSON with a title, 6-12 items (words/phrases), optional short 'text' intro.",
          },
          {
            role: "user",
            content: `Level: ${level}, Count: ${count}, Topic: ${topic}. Avoid terms: ${avoidTerms.join(", ")}. Return JSON only.`,
          },
        ],
        temperature: 0.7,
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return res.status(500).json({ error: `OpenAI ${r.status}`, detail });
    }
    const data = await r.json();
    let raw = data?.choices?.[0]?.message?.content || "";
    let lesson;
    try {
      lesson = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "Invalid JSON from OpenAI", detail: raw.slice(0, 1000) });
    }
    const fp = lessonFingerprint(lesson);
    lesson.fingerprint = fp;
    return res.status(200).json({ lesson });
  } catch (err) {
    const detail = err?.message || String(err);
    return res.status(500).json({ error: "Server error", detail });
  }
}
