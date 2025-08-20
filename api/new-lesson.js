/* eslint-env node */
/* global process */

export const maxDuration = 60;

const usage = new Map();

function hitLimit(id, max = 200) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${id}:${day}`;
  const count = usage.get(key) || 0;
  if (count >= max) return false;
  usage.set(key, count + 1);
  if (usage.size > 1000) usage.delete(usage.keys().next().value);
  return true;
}

function normalizeLesson(lesson) {
  if (!lesson || typeof lesson !== "object") return [];
  const acc = [];
  if (lesson.title) acc.push(String(lesson.title));
  if (Array.isArray(lesson.items)) {
    for (const it of lesson.items) {
      if (!it) continue;
      if (it.type === "text" && it.content) acc.push(String(it.content));
      if ((it.type === "word" || it.type === "phrase" || it.type === "sentence") && it.term)
        acc.push(String(it.term));
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
      if (term) out.push({ type: "sentence", term });
      continue;
    }
    if (typeof it !== "object") continue;
    if (
      (it.type === "word" || it.type === "phrase" || it.type === "sentence") &&
      typeof it.term === "string" &&
      it.term.trim()
    ) {
      const obj = { type: it.type, term: it.term.trim() };
      if (typeof it.thai === "string" && it.thai.trim()) obj.thai = it.thai.trim();
      out.push(obj);
    } else if (it.type === "text" && typeof it.content === "string" && it.content.trim()) {
      const obj = { type: "text", content: it.content.trim() };
      if (typeof it.thai === "string" && it.thai.trim()) obj.thai = it.thai.trim();
      out.push(obj);
    } else if (typeof it.term === "string" && it.term.trim()) {
      const obj = { type: "sentence", term: it.term.trim() };
      if (typeof it.thai === "string" && it.thai.trim()) obj.thai = it.thai.trim();
      out.push(obj);
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }
  const uid = req.headers["x-firebase-uid"] || req.headers["x-uid"];
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const key = uid ? `uid:${uid}` : `ip:${ip}`;
  if (!hitLimit(key)) {
    return res.status(429).json({ error: "Daily limit exceeded (200/day)" });
  }
  try {
    const { level = "beginner", topic = "daily life" } = req.body ?? {};

    async function callOpenAI(cnt, avoid = []) {
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
                "You generate compact ESL lessons for Thai learners. Respond with JSON only in the shape {title, items:[{type:'sentence', term, thai}]}. Each item is a unique English sentence or short conversational phrase of 5-10 words with a simple Thai translation in the 'thai' field. Mix statements, questions, and short phrases.",
            },
            {
              role: "user",
              content: `Level: ${level}, Count: ${cnt}, Topic: ${topic}. Avoid sentences: ${avoid.join(" | ")}.`,
            },
          ],
          temperature: 0.7,
        }),
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (!r.ok) {
        console.error("openai upstream", r.status);
        throw new Error(`upstream ${r.status}`);
      }
      const data = await r.json();
      let raw = data?.choices?.[0]?.message?.content || "";
      raw = raw.trim();
      if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error("openai invalid json", raw.slice(0, 200));
        throw new Error("invalid json");
      }
      return {
        title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "",
        items: parseItems(parsed.items),
      };
    }

    const desired = 10;
    let title = "";
    const items = [];
    const seen = new Set();
    for (let attempt = 0; attempt < 5 && items.length < desired; attempt++) {
      const need = (desired - items.length) * 2;
      const avoid = Array.from(seen);
      const resp = await callOpenAI(need, avoid);
      if (!title && resp.title) title = resp.title;
      for (const it of resp.items) {
        const term = typeof it.term === "string" ? it.term.trim() : "";
        if (!term) continue;
        const norm = term.toLowerCase();
        const words = norm.split(/\s+/);
        if (words.length < 5 || words.length > 10) continue;
        if (seen.has(norm)) continue;
        seen.add(norm);
        items.push({ type: "sentence", term, thai: it.thai || "" });
        if (items.length >= desired) break;
      }
    }
    if (items.length < desired) {
      const fallback = [
        { type: "sentence", term: "I like to walk in the park.", thai: "" },
        { type: "sentence", term: "What time is it right now?", thai: "" },
        { type: "sentence", term: "She drinks coffee every morning.", thai: "" },
        { type: "sentence", term: "Can you help me with this?", thai: "" },
        { type: "sentence", term: "We are going to the beach.", thai: "" },
        { type: "sentence", term: "He reads a book every night.", thai: "" },
        { type: "sentence", term: "Please close the window, it's cold.", thai: "" },
        { type: "sentence", term: "They will arrive in ten minutes.", thai: "" },
        { type: "sentence", term: "Do you want to join us?", thai: "" },
        { type: "sentence", term: "This restaurant serves delicious food.", thai: "" },
      ];
      for (const f of fallback) {
        if (items.length >= desired) break;
        const norm = f.term.toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        items.push(f);
      }
    }

    const lesson = {
      title: title || "Lesson",
      items: items.slice(0, desired),
      itemsCount: desired,
      meta: { level, topic },
    };
    return res.status(200).json({ lesson: { ...lesson, fingerprint: lessonFingerprint(lesson) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Upstream error", status: 500 });
  }
}
