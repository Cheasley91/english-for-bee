/* eslint-disable */
// /api/new-lesson.js
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const PRIMARY_MODEL = "gpt-4o-mini";     // try this first
const FALLBACK_MODEL = "gpt-4o-mini";    // keep same or change to "gpt-4o" if needed

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    }

    const {
      level = "A1",
      theme = "market",
      count = 6,
      review_from = [],
      preferred_themes = [],
      last_score = null,
      trouble_words = [],
    } = (req.body ?? {});

    const targetCount = Math.max(4, Math.min(12, Number(count) || 6));

    const LEVEL_RULES = {
      A0: [
        "Use only very common words (A0).",
        "Prefer single words and 2–3 word phrases.",
        "Keep example_en <= 6 words; tts_line_en <= 6 words."
      ],
      A1: [
        "Use common everyday words (A1).",
        "Short phrases and simple sentences.",
        "Keep example_en <= 8 words; tts_line_en <= 10 words."
      ],
      A2: [
        "Use frequent A2 vocabulary and collocations.",
        "Include short sentences with basic grammar (present/past).",
        "Keep example_en <= 12 words; tts_line_en <= 10 words."
      ],
      B1: [
        "Use B1 vocabulary and common patterns.",
        "Include multi-sentence examples and light variation.",
        "Allow example_en up to 16 words; tts_line_en <= 12 words."
      ],
      B2: [
        "Use B2 vocabulary and natural phrasing.",
        "Include short 2–3 turn mini-dialogues in roleplay.",
        "Allow example_en up to 20 words; tts_line_en <= 12 words."
      ]
    };
    const levelConstraints = (LEVEL_RULES[level] || LEVEL_RULES.A1).join("\n");

    const system = [
      "You are a lesson generator for a Thai learner of English (Bee).",
      "Output STRICT JSON only. No prose. No markdown. No trailing commas.",
      "Constraints:",
      "- Keep total new_vocab length 6–8 for A1/A2, 8–12 for B1/B2.",
      `- Limit new_vocab to <= ${targetCount} items.`,
      "- 'en', 'example_en', 'tts_line_en' must be ASCII only.",
      "- Avoid slang or rare words; everyday topics only.",
      "- Do NOT repeat any item present in 'review_from'.",
      "- All 'tts_line_en' must be self-contained.",
      levelConstraints,
      "",
      `Schema:
{
  "id": "string-slug",
  "level": "A0|A1|A2|B1|B2",
  "theme": "string",
  "objectives": ["string"],
  "review_from": ["string"],
  "new_vocab": [
    {
      "en": "string",
      "th": "string",
      "pos": "noun|verb|adj|adv|phrase",
      "cefr": "A0|A1|A2|B1|B2",
      "example_en": "short sentence using the word",
      "example_th": "Thai translation",
      "tts_line_en": "short clear sentence (<=10 words)",
      "notes": "brief usage tip (<=12 words)"
    }
  ],
  "grammar_focus": {
    "topic": "string",
    "mini_explanation_en": "10–25 words, simple English",
    "examples": ["string"]
  },
  "exercises": [
    {
      "type": "match"|"listen_and_type"|"fill_blank"|"roleplay",
      "pairs"?: [["string","string"]],
      "targets"?: ["string"],
      "items"?: [{"prompt_en":"string","answer_en":"string"}],
      "instructions_en": "string"
    }
  ],
  "assessment": {
    "items": [{"q_en":"string","a":"string"}],
    "passing_score": 4
  },
  "spaced_review": ["1-day","3-day","7-day"],
  "next_lesson_hint": "string"
}`
    ].join("\n");

    const user = [
      "Generate a new lesson given Bee’s progress.",
      "",
      `Learner profile:
- Level: ${level}
- Native language: Thai
- Preferred themes: ${Array.isArray(preferred_themes) && preferred_themes.length ? preferred_themes.join(", ") : "(none)"}
- Known items to recycle/avoid: ${JSON.stringify(review_from)}`,
      "",
      `Last lesson summary:
- Score: ${last_score ?? "(n/a)"}
- Trouble words: ${JSON.stringify(trouble_words)}`,
      "",
      `Lesson constraints:
- Theme for this lesson: "${theme}"
- New vocab target count: ${targetCount}
- Grammar focus (optional): ""`,
      "",
      "Output JSON only. No extra keys."
    ].join("\n");

    // First attempt: JSON mode (response_format)
    let text;
    try {
      text = await chat(system, user, PRIMARY_MODEL, true);
    } catch (err1) {
      // Fallback: no JSON mode, parse manually
      try {
        text = await chat(system, user, FALLBACK_MODEL, false);
      } catch (err2) {
        const detail = (err2 && (err2.message || String(err2))) || "unknown";
        return res.status(502).json({ error: "OpenAI call failed", detail });
      }
    }

    let lesson = safeParse(text);
    if (!validLesson(lesson)) {
      // One repair attempt
      const repair = `Your previous output was not valid JSON per the schema. Re-output JSON ONLY. Do not include commentary or markdown.`;
      try {
        const repairedText = await chat(system, repair, PRIMARY_MODEL, true, text);
        lesson = safeParse(repairedText);
      } catch {
        // ignore
      }
    }

    if (!validLesson(lesson)) {
      return res.status(502).json({ error: "Model returned invalid JSON", raw: (text || "").slice(0, 1000) });
    }

    // Trim to requested count
    if (Array.isArray(lesson.new_vocab) && lesson.new_vocab.length > targetCount) {
      lesson.new_vocab = lesson.new_vocab.slice(0, targetCount);
    }
    // ASCII guard for english fields
    for (const it of lesson.new_vocab || []) {
      if (it.en) it.en = asciiOnly(it.en);
      if (it.example_en) it.example_en = asciiOnly(it.example_en);
      if (it.tts_line_en) it.tts_line_en = asciiOnly(it.tts_line_en);
    }

    return res.status(200).json({ lesson });
  } catch (e) {
    console.error("new-lesson server error:", e);
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
}

async function chat(system, user, model, useJSONMode, priorOutput) {
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      ...(priorOutput ? [{ role: "assistant", content: priorOutput }] : []),
      { role: "user", content: user },
    ],
    temperature: 0.6,
    max_tokens: 1000,
  };
  if (useJSONMode) body.response_format = { type: "json_object" };

  const r = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`OpenAI ${r.status}: ${t}`);
  }
  const data = await r.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}
function validLesson(obj) {
  if (!obj || typeof obj !== "object") return false;
  if (!obj.id || !obj.level || !obj.theme) return false;
  if (!Array.isArray(obj.new_vocab) || obj.new_vocab.length === 0) return false;
  for (const it of obj.new_vocab) {
    if (!it || !it.en || !it.th) return false;
  }
  return true;
}
function asciiOnly(s) {
  return String(s).replace(/[^\x00-\x7F]/g, "").trim();
}
