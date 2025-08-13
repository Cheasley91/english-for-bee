// Vercel serverless function: /api/new-lesson
// POST JSON -> returns a strict JSON lesson (see schema below)

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini"; // fast+cheap; can swap later

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    }

    // —— read request body —— //
    const {
      level = "A1",            // "A0"|"A1"|"A2"|"B1"|"B2"
      theme = "market",        // e.g., "market", "cooking"
      count = 6,               // 6–8 typical for A1/A2
      review_from = [],        // words/phrases to recycle/avoid
      last_score = null,       // optional
      trouble_words = [],      // optional
      preferred_themes = [],   // optional
    } = (req.body ?? {});

    // clamp count
    const targetCount = Math.max(4, Math.min(12, Number(count) || 6));

    // —— prompts (system + user) —— //
    const system = [
      "You are a lesson generator for a Thai learner of English (Bee).",
      "Output STRICT JSON only. No prose. No markdown. No trailing commas.",
      "Constraints:",
      "- Keep total new_vocab length 6–8 for A1/A2, 8–12 for B1/B2.",
      `- Limit new_vocab to <= ${targetCount} items.`,
      "- 'en', 'example_en', 'tts_line_en' must be ASCII only.",
      "- Avoid slang or rare words; everyday topics only.",
      "- Do NOT repeat any item present in 'review_from'.",
      "- All 'tts_line_en' must be self-contained and <= 10 words.",
    ].join("\n");

    const schemaHint = `Schema:
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
}`;

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
      schemaHint,
      "",
      "Output JSON only. No extra keys."
    ].join("\n");

    // —— single call with JSON mode —— //
    const first = await openAIChatJSON(system, user);
    let lesson = safeParse(first);

    // —— if malformed, ask the model to repair once —— //
    if (!validLesson(lesson)) {
      const repairUser = [
        "Your previous output was not valid JSON per the schema.",
        "Re-output JSON ONLY. No commentary. No markdown.",
        schemaHint
      ].join("\n");

      const repaired = await openAIChatJSON(system, repairUser, first);
      lesson = safeParse(repaired);
    }

    if (!validLesson(lesson)) {
      return res.status(502).json({ error: "Model returned invalid JSON.", raw: first?.slice?.(0, 2000) });
    }

    // Trim to requested count defensively
    if (Array.isArray(lesson.new_vocab) && lesson.new_vocab.length > targetCount) {
      lesson.new_vocab = lesson.new_vocab.slice(0, targetCount);
    }

    // Basic ASCII guard for English fields
    for (const it of lesson.new_vocab || []) {
      if (it.en) it.en = asciiOnly(it.en);
      if (it.example_en) it.example_en = asciiOnly(it.example_en);
      if (it.tts_line_en) it.tts_line_en = asciiOnly(it.tts_line_en);
    }

    return res.status(200).json({ lesson });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}

// ---- helpers ----
async function openAIChatJSON(system, user, priorOutput) {
  const body = {
    model: MODEL,
    response_format: { type: "json_object" }, // enforce JSON object
    messages: [
      { role: "system", content: system },
      ...(priorOutput ? [{ role: "assistant", content: priorOutput }] : []),
      { role: "user", content: user },
    ],
    temperature: 0.6,
    max_tokens: 900, // keep cheap & compact
  };

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
    throw new Error(`OpenAI error ${r.status}: ${t}`);
  }
  const data = await r.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function validLesson(obj) {
  if (!obj || typeof obj !== "object") return false;
  const requiredTop = ["id", "level", "theme", "new_vocab"];
  for (const k of requiredTop) if (!(k in obj)) return false;
  if (!Array.isArray(obj.new_vocab) || obj.new_vocab.length === 0) return false;
  // minimal item checks
  for (const it of obj.new_vocab) {
    if (!it || typeof it !== "object") return false;
    if (!it.en || !it.th) return false;
  }
  return true;
}

function asciiOnly(s) {
  return String(s).replace(/[^\x00-\x7F]/g, "").trim();
}
