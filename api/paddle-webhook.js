// Vercel serverless: Paddle payment webhook -> grant prospects.
//
// When a customer completes a purchase, Paddle POSTs here. We verify the
// signature, look up how many prospects the purchased price grants, and add
// them to that user's balance in `sourcing_balance`.
//
// Required env vars:
//   PADDLE_WEBHOOK_SECRET - the signing secret from Paddle > Notifications
//   PADDLE_PRICE_MAP      - JSON mapping Paddle price IDs to prospect counts, e.g.
//                           {"pri_starter":100,"pri_growth":250,"pri_scale":600}
//   SUPABASE_URL, SUPABASE_SERVICE_KEY - already set
//
// In your Paddle checkout, pass the logged-in user's Supabase id as custom data
// (customData: { user_id: "<uuid>" }) so we know whose balance to credit.
//
// Needs the raw request body for signature verification, so body parsing is off.
export const config = { api: { bodyParser: false } };

import crypto from "node:crypto";

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// Paddle-Signature: "ts=169...;h1=abc..."  -> HMAC_SHA256(secret, `${ts}:${raw}`) === h1
function verify(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(";").map((kv) => kv.split("=")));
  if (!parts.ts || !parts.h1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.ts}:${rawBody}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.h1));
  } catch (_) {
    return false;
  }
}

async function grant(userId, prospects) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  const hdr = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const r = await fetch(`${base}/rest/v1/sourcing_balance?user_id=eq.${userId}&select=prospects_remaining`, { headers: hdr });
  const rows = await r.json().catch(() => []);
  const current = rows && rows[0] ? Number(rows[0].prospects_remaining) || 0 : null;
  const next = (current || 0) + prospects;
  if (current === null) {
    await fetch(`${base}/rest/v1/sourcing_balance`, {
      method: "POST", headers: { ...hdr, Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: userId, prospects_remaining: next }),
    });
  } else {
    await fetch(`${base}/rest/v1/sourcing_balance?user_id=eq.${userId}`, {
      method: "PATCH", headers: { ...hdr, Prefer: "return=minimal" },
      body: JSON.stringify({ prospects_remaining: next, updated_at: new Date().toISOString() }),
    });
  }
  return next;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const raw = await readRaw(req);
    if (!verify(raw, req.headers["paddle-signature"], process.env.PADDLE_WEBHOOK_SECRET))
      return res.status(401).json({ error: "bad signature" });

    const evt = JSON.parse(raw);
    // only act on a completed/paid transaction
    const type = evt.event_type || "";
    if (!/transaction\.(completed|paid)/.test(type)) return res.status(200).json({ ok: true, ignored: type });

    const data = evt.data || {};
    const userId = (data.custom_data && data.custom_data.user_id) || null;
    if (!userId) return res.status(200).json({ ok: true, note: "no user_id in custom_data" });

    const priceMap = JSON.parse(process.env.PADDLE_PRICE_MAP || "{}");
    let prospects = 0;
    (data.items || []).forEach((it) => {
      const priceId = (it.price && it.price.id) || it.price_id;
      const per = Number(priceMap[priceId] || 0);
      const qty = Number(it.quantity || 1);
      prospects += per * qty;
    });
    if (prospects <= 0) return res.status(200).json({ ok: true, note: "no mapped prospects for this price" });

    const total = await grant(userId, prospects);
    return res.status(200).json({ ok: true, granted: prospects, total });
  } catch (e) {
    return res.status(400).json({ error: "webhook error" });
  }
}
