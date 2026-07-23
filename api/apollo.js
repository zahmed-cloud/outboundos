// Vercel serverless function: Apollo People Search proxy.
// The browser can't call Apollo directly (CORS + the key would be exposed in
// the page). This forwards the request server-side using the USER's own Apollo
// key, which they paste in Settings — their account, their credits. We never
// store or log the key. Optional: set APOLLO_ALLOWED_ORIGIN (or reuse
// AI_ALLOWED_ORIGIN) to lock this endpoint to your own domain.
export default async function handler(req, res) {
  const allowed = process.env.APOLLO_ALLOWED_ORIGIN || process.env.AI_ALLOWED_ORIGIN;
  const origin = String(req.headers.origin || "");
  const list = allowed ? allowed.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const okOrigin = !allowed || list.includes(origin); // exact match, not substring
  res.setHeader("Access-Control-Allow-Origin", allowed ? (okOrigin ? origin : list[0]) : "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (allowed && !okOrigin) return res.status(403).json({ error: "origin not allowed" });

  try {
    const { apiKey, query } = req.body || {};
    if (!apiKey || typeof apiKey !== "string")
      return res.status(400).json({ error: "Add your Apollo API key in Settings." });
    if (!query || typeof query !== "object" || Array.isArray(query))
      return res.status(400).json({ error: "bad query" });

    const per = Math.max(1, Math.min(100, Number(query.per_page) || 25));
    const body = { ...query, per_page: per, page: Math.max(1, Number(query.page) || 1) };

    const r = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": String(apiKey),
      },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok)
      return res
        .status(r.status)
        .json({ error: (j && (j.error || j.error_message || j.message)) || "Apollo error " + r.status });

    // trim to only what the app needs — never echo the key back
    const people = (j.people || []).concat(j.contacts || []).map((p) => ({
      name: p.name,
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      linkedin_url: p.linkedin_url,
      city: p.city,
      state: p.state,
      country: p.country,
      email: p.email,
      organization_name: (p.organization && p.organization.name) || p.organization_name || "",
      organization: { name: (p.organization && p.organization.name) || p.organization_name || "" },
    }));
    return res.status(200).json({ people, pagination: j.pagination || null });
  } catch (e) {
    return res.status(500).json({ error: "Apollo request failed." });
  }
}
