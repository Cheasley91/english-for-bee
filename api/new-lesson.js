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
  return acc.map((s) => s.toLowerCase().trim().replace(/\s+/g, " ")).sort();
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

function parseItems(arr) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (const it of arr) {
    if (!it) continue;
    if (typeof it === "string") {
      const term = it.trim();
      if (term) out.push({ type: "word", term });
      continue;
    }
    if (typeof it !== "object") continue;
    if ((it.type === "word" || it.type === "phrase") && typeof it.term === "string" && it.term.trim()) {
      const obj = { type: it.type, term: it.term.trim() };
      if (typeof it.thai === "string" && it.thai.trim()) obj.thai = it.thai.trim();
      out.push(obj);
    } else if (it.type === "text" && typeof it.content === "string" && it.content.trim()) {
      const obj = { type: "text", content: it.content.trim() };
      if (typeof it.thai === "string" && it.thai.trim()) obj.thai = it.thai.trim();
      out.push(obj);
    } else if (typeof it.term === "string" && it.term.trim()) {
      const obj = { type: "word", term: it.term.trim() };
      if (typeof it.thai === "string" && it.thai.trim()) obj.thai = it.thai.trim();
      out.push(obj);
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { level = "beginner", count = 8, topic = "daily life", avoidTerms = [] } = req.body ?? {};
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(new Error("timeout")), 25_000);
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
              "You generate compact ESL lessons for Thai learners. Respond with JSON only in the shape {title, items:[{type:'word'|'phrase'|'text', term?, content?, thai?}]}. Each word or phrase must include a basic Thai translation in the 'thai' field.",
          },
          {
            role: "user",
            content: `Level: ${level}, Count: ${count}, Topic: ${topic}. Avoid terms: ${avoidTerms.join(", ")}.`,
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
    raw = raw.trim();
    if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "Invalid JSON from OpenAI", detail: raw.slice(0, 1000) });
    }
    const items = parseItems(parsed.items).slice(0, Math.min(Math.max(count, 6), 12));
    const lesson = {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Lesson",
      items,
      meta: { level, topic },
    };
    lesson.fingerprint = lessonFingerprint(lesson);
    return res.status(200).json({ lesson });
  } catch (err) {
    const detail = err?.message || String(err);
    return res.status(500).json({ error: "Server error", detail });
  }
}
