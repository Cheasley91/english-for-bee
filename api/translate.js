/* eslint-env node */
/* global process */

export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server misconfigured" });
  }
  try {
    const { terms = [] } = req.body ?? {};
    const list = Array.isArray(terms)
      ? terms.filter((t) => typeof t === "string" && t.trim())
      : [];
    if (list.length === 0) return res.status(400).json({ error: "No terms" });

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
              "You translate English terms to Thai. Respond with a JSON object mapping each input term to its Thai translation.",
          },
          {
            role: "user",
            content: list.join(", "),
          },
        ],
        temperature: 0.2,
      }),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!r.ok) {
      console.error("openai upstream", r.status);
      return res.status(502).json({ error: "Upstream error", status: r.status });
    }
    const data = await r.json();
    let raw = data?.choices?.[0]?.message?.content || "";
    raw = raw.trim();
    if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const translations = {};
    for (const term of list) {
      if (typeof parsed[term] === "string" && parsed[term].trim()) {
        translations[term] = parsed[term].trim();
      }
    }
    return res.status(200).json({ translations });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}
