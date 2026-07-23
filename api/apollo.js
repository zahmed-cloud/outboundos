// Vercel serverless function: Apollo proxy (People Search + optional email enrichment).
// The browser can't call Apollo directly (CORS + the key would be exposed in the
// page). This forwards the request server-side using the USER's own Apollo key,
// which they paste in Settings — their account, their credits. We never store or
// log the key. Optional: set APOLLO_ALLOWED_ORIGIN (or reuse AI_ALLOWED_ORIGIN)
// to lock this endpoint to your own domain.
const LOCKED = /email_not_unlocked|notunlocked|domain\.com/i;

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
    const { apiKey, query, action, people } = req.body || {};
    if (!apiKey || typeof apiKey !== "string")
      return res.status(400).json({ error: "Add your Apollo API key in Settings." });

    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "X-Api-Key": String(apiKey),
    };
    const errOf = (j, r) => (j && (j.error || j.error_message || j.message)) || "Apollo error " + r.status;

    // ---- email enrichment (Bulk People Match, max 10 per call, ~1 credit each) ----
    if (action === "enrich") {
      if (!Array.isArray(people) || !people.length)
        return res.status(400).json({ error: "no people to enrich" });
      const details = people.slice(0, 10);
      const r = await fetch("https://api.apollo.io/api/v1/people/bulk_match", {
        method: "POST",
        headers,
        body: JSON.stringify({ details, reveal_personal_emails: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: errOf(j, r) });
      const matches = (j.matches || []).map((m) => {
        const em = m && m.email && !LOCKED.test(m.email) ? m.email : "";
        return { email: em };
      });
      return res.status(200).json({ matches });
    }

    // ---- people search (new API-caller endpoint; returns no emails) ----
    if (!query || typeof query !== "object" || Array.isArray(query))
      return res.status(400).json({ error: "bad query" });
    const per = Math.max(1, Math.min(100, Number(query.per_page) || 25));
    const body = { ...query, per_page: per, page: Math.max(1, Number(query.page) || 1) };
    const r = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: errOf(j, r) });

    // keep every top-level scalar (so linkedin_url survives whatever it's named)
    // plus the org name; drop big nested arrays to keep the payload light.
    const shallow = (p) => {
      const o = {};
      for (const k in p) {
        const v = p[k];
        if (v == null) continue;
        const t = typeof v;
        if (t === "string" || t === "number" || t === "boolean") o[k] = v;
      }
      const orgName = (p.organization && p.organization.name) || p.organization_name || o.organization_name || "";
      o.organization_name = orgName;
      o.organization = { name: orgName };
      return o;
    };
    const peopleOut = (j.people || []).concat(j.contacts || []).map(shallow);
    return res.status(200).json({ people: peopleOut, pagination: j.pagination || null });
  } catch (e) {
    return res.status(500).json({ error: "Apollo request failed." });
  }
}
