// Vercel serverless: owner-only key admin for Sourcing.
//
// Lets ONLY the owner (the account whose email === OWNER_EMAIL) set/change the
// Apollo + Claude keys used by /api/sourcing, from the in-app admin panel — no
// redeploy needed. Keys are written to `owner_config` (service-key only) and are
// NEVER returned to the browser; the panel only ever sees "set / not set".
//
// Required env: OWNER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_KEY
// Needs the `owner_config` table (see SOURCING_SETUP.md).

async function verifyUser(token) {
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u : null;
}
async function getConfig() {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/owner_config?id=eq.1&select=apollo_key,anthropic_key`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json().catch(() => []);
  return (rows && rows[0]) || {};
}
async function saveConfig(patch) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  const hdr = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
  // upsert the single config row (id = 1)
  await fetch(`${base}/rest/v1/owner_config?on_conflict=id`, {
    method: "POST", headers: hdr, body: JSON.stringify({ id: 1, ...patch, updated_at: new Date().toISOString() }),
  });
}

export default async function handler(req, res) {
  const allowed = process.env.SOURCING_ALLOWED_ORIGIN || process.env.AI_ALLOWED_ORIGIN;
  const origin = String(req.headers.origin || "");
  const list = allowed ? allowed.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const okOrigin = !allowed || list.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", allowed ? (okOrigin ? origin : list[0]) : "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (allowed && !okOrigin) return res.status(403).json({ error: "origin not allowed" });

  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Please log in." });
    const user = await verifyUser(token);
    if (!user) return res.status(401).json({ error: "Session expired." });

    const ownerEmail = String(process.env.OWNER_EMAIL || "").trim().toLowerCase();
    const isOwner = !!ownerEmail && String(user.email || "").toLowerCase() === ownerEmail;
    if (!isOwner) return res.status(403).json({ error: "Not authorised.", isOwner: false });

    const { action, apollo_key, anthropic_key } = req.body || {};

    if (action === "status") {
      const cfg = await getConfig();
      return res.status(200).json({
        isOwner: true,
        apolloSet: !!(cfg.apollo_key || process.env.OWNER_APOLLO_KEY),
        anthropicSet: !!(cfg.anthropic_key || process.env.OWNER_ANTHROPIC_KEY),
      });
    }

    if (action === "save") {
      const patch = {};
      if (typeof apollo_key === "string" && apollo_key.trim()) patch.apollo_key = apollo_key.trim();
      if (typeof anthropic_key === "string" && anthropic_key.trim()) patch.anthropic_key = anthropic_key.trim();
      if (!Object.keys(patch).length) return res.status(400).json({ error: "Nothing to save." });
      await saveConfig(patch);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "admin request failed" });
  }
}
