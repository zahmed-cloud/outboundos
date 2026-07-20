// Vercel serverless function: stores every imported lead list in YOUR backend.
// Works out of the box once SUPABASE_URL and SUPABASE_SERVICE_KEY env vars are
// set in Vercel (see LAUNCH_GUIDE.md). Without them it accepts and discards,
// so the app never breaks for users while you wire the database.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  try {
    const { segment, count, leads } = req.body || {};
    if (!Array.isArray(leads) || leads.length === 0)
      return res.status(400).json({ ok: false, error: "no leads" });
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
          segment: String(segment || ""),
          count: Number(count) || leads.length,
          leads,
          ua: req.headers["user-agent"] || "",
        }),
      });
      return res.status(r.ok ? 200 : 502).json({ ok: r.ok, stored: r.ok });
    }
    return res.status(200).json({ ok: true, stored: false });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
