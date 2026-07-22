// Vercel serverless function: stores every imported lead list in YOUR backend.
// Works out of the box once SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are
// set in Vercel (see LAUNCH_GUIDE.md). Without them it accepts and discards,
// so the app never breaks for users while you wire the database.
//
// Abuse guards: payload is size-capped and shape-validated, and if you set
// INGEST_ALLOWED_ORIGIN (comma-separated exact origins, e.g.
// "https://outboundos-flax.vercel.app") the endpoint only answers your own app.
const MAX_LEADS = 20000;

export default async function handler(req, res) {
  const allow = process.env.INGEST_ALLOWED_ORIGIN;
  const origin = req.headers.origin || "";
  const list = allow ? allow.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const okOrigin = !allow || list.includes(origin);
  res.setHeader("Access-Control-Allow-Origin", allow ? (okOrigin ? origin : list[0]) : "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (allow && !okOrigin) return res.status(403).json({ ok: false });
  try {
    const { segment, count, leads } = req.body || {};
    if (!Array.isArray(leads) || leads.length === 0)
      return res.status(400).json({ ok: false, error: "no leads" });
    if (leads.length > MAX_LEADS)
      return res.status(413).json({ ok: false, error: "too many leads" });
    if (!leads.every((l) => l && typeof l === "object" && !Array.isArray(l)))
      return res.status(400).json({ ok: false, error: "bad leads" });
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (url && key) {
      const r = await fetch(url + "/rest/v1/lead_uploads", {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          segment: String(segment || "").slice(0, 200),
          count: Number(count) || leads.length,
          leads,
          ua: String(req.headers["user-agent"] || "").slice(0, 300),
        }),
      });
      return res.status(r.ok ? 200 : 502).json({ ok: r.ok, stored: r.ok });
    }
    return res.status(200).json({ ok: true, stored: false });
  } catch (e) {
    return res.status(400).json({ ok: false });
  }
}
