# Launch Guide, start to live

Follow top to bottom. Nothing here assumes prior deploys.

## 0. Open and test locally (2 minutes)
1. Open this folder in VS Code (`File → Open Folder → outbound-os`).
2. Open `index.html` in Chrome — that's the landing page. Hit OPEN THE APP
   (or open `app.html` directly — that's your daily driver now).
3. You'll see the empty state. Click IMPORT LEADS (CSV) and feed it
   `sample_leads.csv`. Name the list, watch it become a segment.
4. Click around: Focus mode, drawer, Settings (⋯ menu). If it all works
   locally, it will work deployed.

## Important: your private data file
`js/mydata.js` holds YOUR leads, segments and templates. It is listed in
`.gitignore`, so it never goes to GitHub and never deploys. Locally you get
your full setup; the public site ships empty and users import their own.
Never remove that line from `.gitignore`.

## 1. Push to GitHub (5 minutes)
In the VS Code terminal, inside this folder:

```bash
git init
git add .
git commit -m "Outbound OS v1"
```

Create an empty repo on github.com (name: `outbound-os`, no README), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/outbound-os.git
git branch -M main
git push -u origin main
```

Refresh GitHub, your code is live in the repo.

## 2. Deploy on Vercel (5 minutes)
1. Go to vercel.com, sign in with GitHub.
2. Add New → Project → Import `outbound-os`.
3. Framework preset: **Other**. Root directory: leave as is. No build command,
   no output directory. Deploy.
4. You get a URL like `outbound-os-xxx.vercel.app`. Open it, the app runs.
5. The importer already POSTs every uploaded list to `/api/ingest`. Until you
   finish step 3 below, the function accepts and discards (nothing breaks).

Custom domain: Project → Settings → Domains → add `os.getascent.co`, follow the
DNS instruction it prints (one CNAME record at your DNS provider).

## 3. The backend: store every uploaded list (15 minutes)
This is the part that puts imported lead lists in YOUR database.

### 3a. Create the database
1. Go to supabase.com → New project (free tier is fine). Pick a strong DB
   password, region close to you.
2. In the project: SQL Editor → New query → run this:

```sql
create table lead_uploads (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  segment text,
  count int,
  leads jsonb,
  ua text
);
alter table lead_uploads enable row level security;
-- no public policies: only the service key (your server) can write or read
```

### 3b. Connect Vercel to it
1. Supabase → Project Settings → API. Copy two values:
   - Project URL (looks like `https://xxxx.supabase.co`)
   - `service_role` key (secret! never put it in frontend code)
2. Vercel → your project → Settings → Environment Variables. Add both:
   - `SUPABASE_URL` = the project URL
   - `SUPABASE_SERVICE_KEY` = the service_role key
3. Deployments → Redeploy (so the function picks up the env vars).

### 3c. Verify the flow
1. Open your live URL, import `sample_leads.csv`.
2. Supabase → Table Editor → `lead_uploads`. A new row appears with the
   segment name, count, and the full list as JSON.

That's the whole pipeline: user imports a CSV → the app stores it in their
browser for daily use → a copy lands in your `lead_uploads` table.

## 3.5 The Claude brain (5 minutes, know the cost model first)
The app has a full AI layer: reply drafting in your voice, opener tailoring
per lead, and a coach that reads the real ledger. It runs in one of two modes:

**Mode A — user brings their own key (default, costs you nothing).**
Anyone (including you, locally) opens Settings and pastes a Claude API key
from console.anthropic.com. Calls go from their browser straight to Anthropic.
The key never touches your servers. Your own machine already has your Ascent
positioning baked in via `js/mydata.js` (`SEED_AI`), so drafts sell Ascent
correctly out of the box.

**Mode B — you host the brain (`/api/ai`).**
Add an env var in Vercel: `ANTHROPIC_API_KEY` = a key from YOUR Anthropic
account, then redeploy. Now every visitor without their own key gets AI through
your key — which means **you pay for every draft anyone makes**. Only switch
this on deliberately: as a demo perk, or as the paid tier ($29–39/mo covers it
easily; a draft costs cents). If you do, also set `AI_ALLOWED_ORIGIN` =
`os.getascent.co` (or your vercel.app domain) so other sites can't call your
endpoint and drain the key.

Leave `ANTHROPIC_API_KEY` unset and Mode B simply answers "paste your own key
in Settings" — nothing breaks.

## 3.5b Find leads with Apollo (`/api/apollo`)
The ⋯ menu → **Find leads with Apollo** lets a user describe leads in plain
English; Claude turns it into an Apollo People Search, and the results (with
LinkedIn URL, full name, and email if asked) drop into a new list. It runs on
**the user's own Apollo key**, pasted in Settings — their account, their credits
(~1 Apollo credit per lead, because Apollo only unlocks LinkedIn via enrichment).

Nothing to set up: `api/apollo.js` just proxies Apollo (the browser can't call it
directly — CORS + the key would be exposed). It never stores or logs the key.
Optionally set `APOLLO_ALLOWED_ORIGIN` = your domain (it also honours
`AI_ALLOWED_ORIGIN`) so other sites can't use your endpoint as a relay. There is
no owner-hosted Apollo key — it is always bring-your-own.

## 3.6 Accounts: make login required on the live site (15 minutes)
The app ships with a full account system — email login link (no passwords),
and every user's pipeline saves to their account and syncs between devices.
It activates the moment you fill in the config; until then the site runs open.

### 3a. Create the state table (same Supabase project as step 3)
SQL Editor → New query:

```sql
create table user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app jsonb,
  leads jsonb,
  updated_at timestamptz default now()
);
alter table user_state enable row level security;
create policy "own state" on user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### 3b. Configure auth
1. Supabase → Authentication → Providers → Email: ON (it is by default) —
   this covers both password login and the emailed login link.
   Optional but recommended for less friction: Authentication → Providers →
   Email → turn OFF "Confirm email", so CREATE FREE ACCOUNT logs people in
   instantly instead of making them verify first.
2. Supabase → Authentication → URL Configuration:
   - Site URL: `https://os.getascent.co`
   - Redirect URLs: add `https://os.getascent.co/app`
3. Optional: enable the Google provider (needs a Google OAuth client) and set
   `google: true` in the config below.

### 3c. Switch it on
Edit `js/config.js` in the repo:
- `url`: your Supabase project URL
- `anon`: the anon/public key (Settings → API — the ANON key, never the
  service_role key; anon is public by design, row-level security protects data)

Commit and push. From that deploy on, the live site requires a free account,
and every user's data follows them. Two things stay true:
- Your Mac (`file://` or empty config) never gates — your daily driver is
  untouched.
- Sync is last-write-wins per account: browser stays the fast local copy, the
  cloud snapshot updates every 10 seconds while they work.

## 4. How the app works for a user (so you can explain it)
1. First open: empty state asks for a CSV. Columns it understands: Name,
   Title, Company, Country, Location, LinkedIn, Email (order doesn't matter,
   extra columns are ignored). Each import becomes a segment with its own
   color.
2. Settings (⋯ menu): they choose their own daily targets: requests,
   reachouts, posts (zero switches a ring off), plus revenue goal and average
   deal size. Nothing is forced.
3. Daily loop: due list first, then Focus mode for requests, tap the ring for
   reachouts done on LinkedIn, one tap for the day's post, seal the day.
4. Replies → playbook. Deals → pipeline with aging. Wins → Clients with MRR.
5. Backup (⋯ menu) downloads everything (app state + leads) as one JSON;
   Restore loads it on any machine.
6. Claude AI: the drawer drafts replies from what a prospect actually said and
   tailors openers from their profile, always in the user's own template voice;
   ⋯ menu → Claude coach reads their real numbers and says what to fix. Powered
   by their key (Settings) or yours (step 3.5).

## 4.5 SEO & AI search (15 minutes, do once after deploy)
The repo already ships everything crawlers need: meta tags + OG share image
(`assets/og.png`), JSON-LD structured data (app + FAQ), `robots.txt` (explicitly
welcomes GPTBot, ClaudeBot, PerplexityBot and friends), `sitemap.xml`, and
`llms.txt` (the file AI search engines read to understand and recommend tools).

After the site is live, three submissions make it real:
1. **Google Search Console** (search.google.com/search-console): add
   `os.getascent.co`, verify via DNS, submit `sitemap.xml`.
2. **Bing Webmaster Tools** (bing.com/webmasters): same drill. This one matters
   more than people think — **Bing's index feeds ChatGPT search**.
3. If your domain ends up different from `os.getascent.co`, update the URL in
   four files: `index.html` (canonical + og tags), `robots.txt`, `sitemap.xml`,
   `llms.txt`. The app lives at `/app` thanks to `vercel.json` cleanUrls.

The part no file can do: **links and mentions**. AI assistants recommend what
they see talked about. Your LinkedIn posts linking to the app, a Product Hunt
launch, and users sharing it are what make ChatGPT and Claude start suggesting
it — the files above make sure that when crawlers arrive, they understand
exactly what it is and who built it.

## 5. Launch checklist
- [ ] Local test passed (step 0)
- [ ] Repo on GitHub
- [ ] Live on Vercel, custom domain optional
- [ ] Supabase table created, env vars set, test row verified
- [ ] Accounts on: `user_state` table + policies created, `js/config.js` filled,
      login link tested end to end (step 3.6)
- [ ] Privacy Policy + Terms live at getascent.co/privacy and getascent.co/terms —
      the landing footer and the signup card already link to those exact URLs, so
      they must exist before the site goes public. The policy MUST disclose that
      imported lead lists are stored on your backend (that's what makes the quiet
      landing page legally fine, especially for UK and EU users)
- [ ] HARD GATE: `js/config.js` filled and accounts verified live — the landing
      promises accounts and sync, so do not promote the URL until the login gate
      actually appears on it
- [ ] After first deploy, open yourdomain.com/js/mydata.js and confirm it 404s
      (gitignore + .vercelignore both block it; verify anyway, that file is your
      real lead list)
- [ ] Rewrite `js/content.js` templates in your voice if you haven't
- [ ] Post it. The pitch materials live on your Mac at
      `~/apollo_founders/OutboundOS_OnePager.pdf` and `OutboundOS_Deck.pdf`
      (kept out of this repo on purpose).

## 6. Roadmap parking lot (phase 2, when traction says so)
- Accounts + sync (the localStorage model maps 1:1 to database tables)
- Team seats: shared lead pool, per-person rings
- Chrome extension that auto-logs real LinkedIn sends
- Template editing UI in-app (today it's `js/content.js`)
