export default async function handler(req, res) {
  try {
    const { target, heard } = await readJSON(req);
    if (!target) return res.status(400).json({ error: "Missing target" });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content:
            "You are a concise ESL tutor for a Thai L1 learner. Return JSON with fields: score (0-100), verdict ('match'|'close'|'incorrect'), tip (<=120 chars), and highlight (string showing the part to improve). No extra text."
          },
          { role: "user", content:
            `Target: "${target}"\nHeard: "${heard || ""}"\nEvaluate pronunciation similarity (focus on intelligibility, key sounds like /v/ vs /w/, articles a/an/the).`
          }
        ]
      })
    });

    if (!r.ok) return res.status(500).json({ error: await r.text() });
    const data = await r.json();
    let out = {};
    try { out = JSON.parse(data.choices[0].message.content); } catch {}
    res.status(200).json({
      score: out.score ?? 0,
      verdict: out.verdict || "incorrect",
      tip: out.tip || "Try again slowly.",
      highlight: out.highlight || ""
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}

async function readJSON(req){
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
