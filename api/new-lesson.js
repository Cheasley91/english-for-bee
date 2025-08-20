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

function fingerprint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function normalizeSentence(s = "") {
  return s.toLowerCase().replace(/[^a-z?' ]+/g, "").replace(/\s+/g, " ").trim();
}

function tokenize(s) {
  return normalizeSentence(s).split(" ").filter(Boolean);
}

function lessonFingerprint(lesson) {
  const arr = lesson.items.map((i) => normalizeSentence(i.en));
  arr.sort();
  return fingerprint(JSON.stringify(arr));
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function ngramOverlap(a, b) {
  const n = 3;
  const ng = (arr) => {
    const out = new Set();
    for (let i = 0; i <= arr.length - n; i++) out.add(arr.slice(i, i + n).join(" "));
    return out;
  };
  const sa = ng(a);
  const sb = ng(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const minSz = Math.min(sa.size, sb.size) || 1;
  return inter / minSz;
}

function classify(en) {
  const norm = normalizeSentence(en);
  if (/\b(?:not|dont|doesnt|cant|wont|isnt|arent)\b/.test(norm)) return "negation";
  if (norm.startsWith("please ")) return "request";
  if (en.trim().endsWith("?")) return "question";
  return "statement";
}

const userHistory = new Map(); // uid -> {phrases: [], tokens: Map}

function getUser(uid) {
  if (!userHistory.has(uid)) {
    userHistory.set(uid, { phrases: [], tokens: new Map() });
  }
  return userHistory.get(uid);
}

function recordHistory(uid, sentences) {
  const h = getUser(uid);
  for (const s of sentences) {
    const norm = normalizeSentence(s);
    const fp = fingerprint(norm);
    h.phrases.push(fp);
    if (h.phrases.length > 500) h.phrases.shift();
    const toks = tokenize(norm);
    for (const t of toks) h.tokens.set(t, (h.tokens.get(t) || 0) + 1);
  }
}

function topTokens(uid, limit = 50) {
  const h = getUser(uid);
  const entries = Array.from(h.tokens.entries());
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, limit).map((e) => e[0]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }
  const uid = req.headers["x-firebase-uid"] || req.headers["x-uid"] || "anon";
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  const key = uid ? `uid:${uid}` : `ip:${ip}`;
  if (!hitLimit(key)) {
    return res.status(429).json({ error: "Daily limit exceeded (200/day)" });
  }
  try {
    const { category = "routines" } = req.body ?? {};

    async function callOpenAI(cnt, avoid = [], avoidTokens = []) {
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
                "You generate short A1/A2 English practice sentences for Thai learners. Respond with JSON {items:[{type:'s', en, th}]}. Each English sentence is 8-14 words, is a complete sentence starting with a capital letter and ending with ., ? or !, and has a polite Thai translation. Include about 4 statements, 3 questions, 2 polite requests, and 1 negation.",
            },
            {
              role: "user",
              content: `Category: ${category}. Count: ${cnt}. Avoid sentences: ${avoid.join(" | ")}. Discourage tokens: ${avoidTokens.join(", ")}.`,
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
      return { items: Array.isArray(parsed.items) ? parsed.items : [] };
    }

    const desired = 10;
    const user = getUser(uid);
    const avoidSet = new Set(user.phrases);
    let attempts = 0;
    const selected = [];
    const firstWords = new Set();
    const counts = { statement: 0, question: 0, request: 0, negation: 0 };
    while (selected.length < desired && attempts < 3) {
      const needed = desired - selected.length;
      const resp = await callOpenAI(Math.min(18, needed * 2 + 8), Array.from(avoidSet), topTokens(uid));
      const candidates = resp.items
        .map((it) => ({
          en: (it.en || it.term || "").trim(),
          th: (it.th || it.thai || "").trim(),
        }))
        .filter((it) => it.en);

      for (const c of candidates) {
        if (selected.length >= desired) break;
        const norm = normalizeSentence(c.en);
        const fp = fingerprint(norm);
        if (avoidSet.has(fp)) continue;
        const words = tokenize(norm);
        if (words.length < 8 || words.length > 14) continue;
        if (!/^[A-Z]/.test(c.en.trim()) || !/[.!?]$/.test(c.en.trim())) continue;
        let dup = false;
        for (const s of selected) {
          if (jaccard(words, s.tokens) >= 0.8 || ngramOverlap(words, s.tokens) >= 0.6) {
            dup = true;
            break;
          }
        }
        if (dup) continue;
        const first = words[0];
        if (firstWords.has(first)) continue;
        const kind = classify(c.en);
        if (
          (kind === "statement" && counts.statement >= 4) ||
          (kind === "question" && counts.question >= 3) ||
          (kind === "request" && counts.request >= 2) ||
          (kind === "negation" && counts.negation >= 1)
        ) {
          continue;
        }
        selected.push({ en: c.en, th: c.th, fp, tokens: words });
        firstWords.add(first);
        counts[kind]++;
        avoidSet.add(fp);
      }
      attempts++;
    }

    if (selected.length < desired) {
      attempts = 0;
      while (selected.length < desired && attempts < 2) {
        const need = desired - selected.length;
        const resp = await callOpenAI(need + 4, Array.from(avoidSet), topTokens(uid));
        const candidates = resp.items
          .map((it) => ({ en: (it.en || it.term || "").trim(), th: (it.th || it.thai || "").trim() }))
          .filter((it) => it.en);
        for (const c of candidates) {
          if (selected.length >= desired) break;
          const norm = normalizeSentence(c.en);
          const fp = fingerprint(norm);
          if (avoidSet.has(fp)) continue;
          const words = tokenize(norm);
          if (words.length < 8 || words.length > 14) continue;
          if (!/^[A-Z]/.test(c.en.trim()) || !/[.!?]$/.test(c.en.trim())) continue;
          let dup = false;
          for (const s of selected) {
            if (jaccard(words, s.tokens) >= 0.8 || ngramOverlap(words, s.tokens) >= 0.6) {
              dup = true;
              break;
            }
          }
          if (dup) continue;
          const first = words[0];
          if (firstWords.has(first)) continue;
          const kind = classify(c.en);
          if (
            (kind === "statement" && counts.statement >= 4) ||
            (kind === "question" && counts.question >= 3) ||
            (kind === "request" && counts.request >= 2) ||
            (kind === "negation" && counts.negation >= 1)
          ) {
            continue;
          }
          selected.push({ en: c.en, th: c.th, fp, tokens: words });
          firstWords.add(first);
          counts[kind]++;
          avoidSet.add(fp);
        }
        attempts++;
      }
    }

    if (selected.length === 0) {
      return res.status(500).json({ error: "No sentences generated" });
    }

    const items = selected.slice(0, desired).map((s) => ({
      type: "s",
      en: s.en,
      th: s.th,
      fingerprint: s.fp,
    }));

    recordHistory(uid, items.map((i) => i.en));

    const lesson = {
      title: `${category.charAt(0).toUpperCase() + category.slice(1)} — Sentences`,
      items,
      itemsCount: items.length,
      meta: { category },
    };

    return res.status(200).json({ lesson: { ...lesson, fingerprint: lessonFingerprint(lesson) } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Upstream error", status: 500 });
  }
}

