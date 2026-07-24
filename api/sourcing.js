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

const SYS_BASE = `You turn a natural-language prospect request into Apollo People Search parameters. Keys (all optional):
- person_titles: array of job titles, e.g. ["Founder","CEO"]
- person_seniorities: array from ["owner","founder","c_suite","partner","vp","head","director","manager"]
- person_locations: array of the person's location, e.g. ["London, United Kingdom"]
- organization_locations: array of company HQ locations
- organization_num_employees_ranges: array like ["1,10"],["11,50"],["51,200"]
- q_keywords: extra keywords (industry / niche)
- count: integer, how many prospects to source (default 25)
- segment_name: short clean label for this list`;
// when the request is vague, Claude may ask a few sharp questions first
const SYS_ASK = SYS_BASE + `
Apollo returns PEOPLE, not companies. If the request is missing an important targeting detail — WHICH people/roles at the companies, the company SIZE, or the location scope (one city vs a whole country) — reply with ONLY {"clarify": ["short question", ...]} with at most 3 short, specific questions. If the request is already clear enough to search well, reply with ONLY the parameters object. Reply with ONLY valid JSON, no prose, no code fences.`;
// after the user has answered, never ask again — just build the best query
const SYS_FORCE = SYS_BASE + `
The user has already answered any clarifying questions. Do NOT ask anything. Reply with ONLY the parameters object, making sensible assumptions for anything still unspecified. Valid JSON only, no prose.`;

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
// make sure the user has a row (with their name + email) so the owner can see and
// manage them right in the Supabase table editor
async function ensureRow(user) {
  const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || "";
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/sourcing_balance`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ user_id: user.id, email: user.email || "", name }),
  });
}
async function getRow(userId) {
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/sourcing_balance?user_id=eq.${userId}&select=prospects_remaining,prospects_used`,
    { headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` } }
  );
  const rows = await r.json().catch(() => []);
  const row = (rows && rows[0]) || {};
  return { remaining: Number(row.prospects_remaining) || 0, used: Number(row.prospects_used) || 0 };
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
async function applyUsage(userId, remaining, used) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/sourcing_balance?user_id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ prospects_remaining: remaining, prospects_used: used, updated_at: new Date().toISOString() }),
  });
}

async function claudeParse(line, anthropicKey, canClarify) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: AIMODEL, max_tokens: 500, system: canClarify ? SYS_ASK : SYS_FORCE, messages: [{ role: "user", content: line }] }),
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
  // 1) TRY HARD to hit `want`: search the precise target first, then progressively
  // broaden (dropping the least-important filters) — keeping WHO (titles) and WHERE
  // (person location) longest — until we've collected enough fresh people.
  const clean = (f) => { const o = {}; for (const k in f) { const v = f[k]; if (v == null) continue; if (Array.isArray(v) && !v.length) continue; o[k] = v; } return o; };
  const steps = [
    (f) => f,                                                    // exact target
    (f) => ({ ...f, organization_num_employees_ranges: null }),  // drop company size
    (f) => ({ ...f, organization_locations: null }),             // drop company HQ (keep the person's location)
    (f) => ({ ...f, person_seniorities: null }),                 // drop seniority (keep the titles)
    (f) => ({ ...f, q_keywords: null }),                         // drop extra keywords
  ];
  const seen = new Set(), pick = [];
  for (let s = 0; s < steps.length; s++) {
    if (pick.length >= want) break;
    const f = clean(steps[s]({ ...filters }));
    if (!Object.keys(f).length) continue;                        // never search with zero filters
    let page = 1;
    while (pick.length < want && page <= 15) {
      let j;
      try {
        const r = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
          method: "POST", headers: apolloHeaders(apolloKey),
          body: JSON.stringify({ ...f, per_page: 100, page }),
        });
        j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((j && (j.error || j.message)) || "Apollo search failed");
      } catch (e) { if (!pick.length && s === 0 && page === 1) throw e; break; }
      const batch = (j.people || []).map(shallow);
      if (!batch.length) break;
      for (const p of batch) {
        const key = coarseKey(p.first_name || p.name, p.organization_name);
        if (excludeSet.has(key) || seen.has(key)) continue;      // skip known + already-collected
        seen.add(key); pick.push(p);
        if (pick.length >= want) break;
      }
      const total = (j.pagination && j.pagination.total_entries) || null;
      if (batch.length < 100 || (total && page * 100 >= total)) break;
      page++;
    }
  }
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
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "Please log in." });
    const user = await verifyUser(token);
    if (!user) return res.status(401).json({ error: "Session expired — log in again." });

    const { action, line, exclude } = req.body || {};
    await ensureRow(user);              // show them in the owner's table with name + email
    const row = await getRow(user.id);
    let remaining = row.remaining;

    if (action === "balance") return res.status(200).json({ remaining });

    if (action === "source") {
      const keys = await getKeys();
      if (!keys.apollo || !keys.anthropic)
        return res.status(200).json({ error: "Sourcing is being switched on — check back shortly.", remaining });
      if (remaining <= 0)
        return res.status(200).json({ error: "You're out of prospects. Grab a pack to keep sourcing.", remaining: 0 });
      if (!line || typeof line !== "string") return res.status(400).json({ error: "Describe who you want." });

      const clarified = !!(req.body && req.body.clarified);
      let q;
      try { q = await claudeParse(line, keys.anthropic, !clarified); }
      catch (e) { return res.status(200).json({ error: "Couldn't read that request — try rephrasing.", remaining }); }

      // vague request → ask a couple of sharp questions first (no credits spent)
      if (!clarified && Array.isArray(q.clarify) && q.clarify.length)
        return res.status(200).json({ clarify: q.clarify.slice(0, 3), remaining });

      const asked = Math.max(1, Math.min(MAX_PER_PULL, Number(q.count) || 25));
      const want = Math.min(remaining, asked);
      const excludeSet = new Set(Array.isArray(exclude) ? exclude : []);
      const leads = await sourceLeads(filtersOf(q), want, excludeSet, keys.apollo);
      const delivered = leads.length;
      if (delivered > 0) { remaining = Math.max(0, remaining - delivered); await applyUsage(user.id, remaining, row.used + delivered); }

      return res.status(200).json({ leads, delivered, asked, remaining, segment_name: String(q.segment_name || line).slice(0, 44) });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    return res.status(500).json({ error: "Sourcing request failed." });
  }
}
