// Vercel serverless: Ascent Sourcing — the PAID, owner-keyed prospect engine.
//
// Unlike api/apollo.js (bring-your-own-key), this runs on the OWNER's keys and is
// gated by a server-side prospect balance so users only get what they paid for.
//
// Required env vars (set in Vercel):
//   OWNER_APOLLO_KEY      - your Apollo API key (the account that pays the credits)
//   OWNER_ANTHROPIC_KEY   - your Anthropic API key (parses the request)
//   SUPABASE_URL          - already set
//   SUPABASE_SERVICE_KEY  - already set (reads/writes the balance table, bypasses RLS)
//   SOURCING_ALLOWED_ORIGIN (optional) - lock to your domain; falls back to AI_ALLOWED_ORIGIN
//
// Needs the `sourcing_balance` table (see SOURCING_SETUP.md).

const AIMODEL = "claude-opus-4-8";
const LOCKED = /email_not_unlocked|notunlocked|domain\.com/i;
const MAX_PER_PULL = 600; // hard ceiling per single source request

const SYS = `You turn a natural-language prospect request into Apollo People Search parameters. Reply with ONLY a JSON object, no prose, no code fences. Keys (all optional):
- person_titles: array of job titles, e.g. ["Founder","CEO"]
- person_seniorities: array from ["owner","founder","c_suite","partner","vp","head","director","manager"]
- person_locations: array of the person's location, e.g. ["London, United Kingdom"]
- organization_locations: array of company HQ locations
- organization_num_employees_ranges: array like ["1,10"],["11,50"],["51,200"]
- q_keywords: extra keywords (industry / niche)
- count: integer, how many prospects to source (default 25)
- segment_name: short clean label for this list
Return strictly valid JSON.`;

function ok(res, allowed, origin, list) {
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function verifyUser(token) {
  // exchange the user's access token for their identity
  const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id ? u : null;
}
async function getBalance(userId) {
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/sourcing_balance?user_id=eq.${userId}&select=prospects_remaining`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } }
  );
  const rows = await r.json().catch(() => []);
  return rows && rows[0] ? Number(rows[0].prospects_remaining) || 0 : 0;
}
// Live keys: read from the owner_config store (set via the in-app admin panel),
// falling back to env vars. Lets the owner swap keys instantly, no redeploy.
async function getKeys() {
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/owner_config?id=eq.1&select=apollo_key,anthropic_key`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    });
    const rows = await r.json().catch(() => []);
    const cfg = (rows && rows[0]) || {};
    return {
      apollo: cfg.apollo_key || process.env.OWNER_APOLLO_KEY || "",
      anthropic: cfg.anthropic_key || process.env.OWNER_ANTHROPIC_KEY || "",
    };
  } catch (_) {
    return { apollo: process.env.OWNER_APOLLO_KEY || "", anthropic: process.env.OWNER_ANTHROPIC_KEY || "" };
  }
}
async function setBalance(userId, value) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/sourcing_balance?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ prospects_remaining: value, updated_at: new Date().toISOString() }),
  });
}

async function claudeParse(line, anthropicKey) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: AIMODEL, max_tokens: 500, system: SYS, messages: [{ role: "user", content: line }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || "parse failed");
  const raw = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").replace(/```json|```/g, "").trim();
  const q = JSON.parse(raw);
  if (!q || typeof q !== "object" || Array.isArray(q)) throw new Error("bad query");
  return q;
}

const apolloHeaders = (key) => ({
  "Content-Type": "application/json",
  "Cache-Control": "no-cache",
  "X-Api-Key": key,
});
function filtersOf(q) {
  const b = {};
  ["person_titles", "person_seniorities", "person_locations", "organization_locations", "organization_num_employees_ranges"]
    .forEach((k) => { if (Array.isArray(q[k]) && q[k].length) b[k] = q[k]; });
  if (q.q_keywords) b.q_keywords = String(q.q_keywords);
  return b;
}
const coarseKey = (nm, co) =>
  ((String(nm || "").trim().split(/\s+/)[0] || "").toLowerCase() + "|" + String(co || "").trim().toLowerCase());
function shallow(p) {
  const o = {};
  for (const k in p) { const v = p[k]; if (v == null) continue; const t = typeof v; if (t === "string" || t === "number" || t === "boolean") o[k] = v; }
  o.organization_name = (p.organization && p.organization.name) || p.organization_name || o.organization_name || "";
  return o;
}
function bestLinkedIn(p) {
  let u = p.linkedin_url ? String(p.linkedin_url) : "";
  if (!u) for (const k in p) { const v = p[k]; if (typeof v === "string" && /linkedin\.com\/(in|company|pub)\//i.test(v)) { u = v; break; } }
  u = (u || "").trim();
  if (u && !/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  return /linkedin\.com\//i.test(u) ? u : "";
}

async function sourceLeads(filters, want, excludeSet, apolloKey) {
  // 1) search (teaser) — paginate to gather enough survivors after coarse dedupe
  const raw = [];
  let page = 1;
  while (raw.length < want * 1.5 && page <= 12) {
    const r = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST", headers: apolloHeaders(apolloKey),
      body: JSON.stringify({ ...filters, per_page: 100, page }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j && (j.error || j.message)) || "Apollo search failed");
    const batch = (j.people || []).map(shallow);
    if (!batch.length) break;
    for (const p of batch) {
      const co = p.organization_name || "";
      if (excludeSet.has(coarseKey(p.first_name || p.name, co))) continue; // don't pay to enrich known people
      raw.push(p);
      if (raw.length >= want) break;
    }
    const total = (j.pagination && j.pagination.total_entries) || null;
    if (batch.length < 100 || (total && page * 100 >= total)) break;
    page++;
  }
  const pick = raw.slice(0, want);
  if (!pick.length) return [];

  // 2) enrich (unlock LinkedIn + full name + email) in batches of 10
  for (let i = 0; i < pick.length; i += 10) {
    const details = pick.slice(i, i + 10).map((p) => ({
      id: p.id, first_name: p.first_name, last_name: p.last_name, name: p.name,
      organization_name: p.organization_name, linkedin_url: p.linkedin_url, title: p.title,
    }));
    const r = await fetch("https://api.apollo.io/api/v1/people/bulk_match", {
      method: "POST", headers: apolloHeaders(apolloKey),
      body: JSON.stringify({ details, reveal_personal_emails: true }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(j.matches)) {
      const byId = {}; j.matches.forEach((m) => { if (m && m.id) byId[m.id] = m; });
      pick.slice(i, i + 10).forEach((p, idx) => {
        const m = (p.id && byId[p.id]) || j.matches[idx];
        if (!m) return;
        ["linkedin_url", "name", "first_name", "last_name", "title", "email", "city", "state", "country"].forEach((k) => { if (m[k]) p[k] = m[k]; });
        if (m.organization_name || (m.organization && m.organization.name)) p.organization_name = m.organization_name || m.organization.name;
      });
    }
  }

  // 3) map to lead shape
  return pick.map((p) => {
    const em = p.email && !LOCKED.test(p.email) ? p.email : "";
    return {
      name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
      title: p.title || "", co: p.organization_name || "",
      cn: p.country || "", loc: [p.city, p.state, p.country].filter(Boolean).join(", "),
      li: bestLinkedIn(p), em,
    };
  }).filter((l) => l.name || l.co);
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
    const keys = await getKeys();
    if (!keys.apollo || !keys.anthropic)
      return res.status(200).json({ error: "Sourcing isn't switched on yet." });

    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Please log in." });
    const user = await verifyUser(token);
    if (!user) return res.status(401).json({ error: "Session expired — log in again." });

    const { action, line, exclude } = req.body || {};
    let remaining = await getBalance(user.id);

    if (action === "balance") return res.status(200).json({ remaining });

    if (action === "source") {
      if (remaining <= 0)
        return res.status(200).json({ error: "You're out of prospects. Grab a pack to keep sourcing.", remaining: 0 });
      if (!line || typeof line !== "string") return res.status(400).json({ error: "Describe who you want." });

      let q;
      try { q = await claudeParse(line, keys.anthropic); }
      catch (e) { return res.status(200).json({ error: "Couldn't read that request — try rephrasing.", remaining }); }

      const want = Math.min(remaining, MAX_PER_PULL, Math.max(1, Number(q.count) || 25));
      const excludeSet = new Set(Array.isArray(exclude) ? exclude : []);
      const leads = await sourceLeads(filtersOf(q), want, excludeSet, keys.apollo);
      const delivered = leads.length;
      if (delivered > 0) { remaining = Math.max(0, remaining - delivered); await setBalance(user.id, remaining); }

      return res.status(200).json({ leads, delivered, remaining, segment_name: String(q.segment_name || line).slice(0, 44) });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "Sourcing request failed." });
  }
}
