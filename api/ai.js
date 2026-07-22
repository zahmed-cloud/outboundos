// Vercel serverless function: the hosted Claude brain.
// Set ANTHROPIC_API_KEY in Vercel and every user of your deployment gets AI
// drafting on YOUR account (your cost — see LAUNCH_GUIDE.md before enabling).
// Leave it unset and the app politely tells users to paste their own key in
// Settings instead. Optional: set AI_ALLOWED_ORIGIN to your domain so random
// scripts can't burn your credits through this endpoint.
export default async function handler(req, res) {
  const allowed = process.env.AI_ALLOWED_ORIGIN;
  const origin = String(req.headers.origin || "");
  const list = allowed ? allowed.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const okOrigin = !allowed || list.includes(origin); // exact match, not substring
  res.setHeader("Access-Control-Allow-Origin", allowed ? (okOrigin ? origin : list[0]) : "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (allowed && !okOrigin) return res.status(403).json({ error: "origin not allowed" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    return res.status(200).json({
      error:
        "Claude is switched off on this deployment. Paste your own Claude API key in Settings and it works instantly.",
    });
  try {
    const { system, user, max_tokens } = req.body || {};
    if (!user) return res.status(400).json({ error: "no prompt" });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: Math.min(Number(max_tokens) || 700, 1500),
        thinking: { type: "adaptive" },
        system: String(system || "").slice(0, 20000),
        messages: [{ role: "user", content: String(user).slice(0, 30000) }],
      }),
    });
    const j = await r.json();
    if (!r.ok)
      return res
        .status(502)
        .json({ error: (j.error && j.error.message) || "Claude error " + r.status });
    const text = (j.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Claude request failed" });
  }
}
