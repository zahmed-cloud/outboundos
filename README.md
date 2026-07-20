# Ascent Outbound OS

The operating system for winning clients on LinkedIn. It tells you what to
do today, and the numbers are always real.

Free tool by [Ascent](https://getascent.co), built by
[Jamil Ahmed](https://www.linkedin.com/in/getascent/) — founder of Ascent, who
uses it daily to win Ascent's own clients. For agency owners, founders,
recruiters, consultants, anyone who needs clients and hates chaos.

## What it does
- Import your lead lists (CSV), each list becomes a segment — or add, edit and
  delete leads one at a time.
- Daily targets you choose: connection requests, reachouts, posts. Rings fill
  from real logged actions only.
- Focus mode deals you one lead at a time with the message ready to copy.
- Reply playbook: whatever they said, there's a written answer.
- Deal pipeline with aging and chase messages. Proposals never rot quietly.
- Client book: won deals become retainers with MRR and check-in reminders.
- Smart queue: Focus learns from your own accept rates (per segment and title)
  and serves the likeliest leads first, telling you why. Activates honestly at
  30 logged requests, never before.
- A truth ledger underneath everything: every stat is a logged action, undo
  erases it, nothing double counts.
- Claude built in: paste what a prospect said and it drafts the reply in
  your voice (learned from your own templates), tailor openers from a
  prospect's profile, and a coach that reads your real ledger and tells you
  what to fix. Bring your own Claude API key (Settings), or the deployment
  owner can host it (`api/ai.js`).

## Stack
Plain HTML, CSS and JavaScript. No frameworks, no build step. One serverless
function (`api/ingest.js`) receives imported lead lists when deployed on Vercel.

## Run locally
Open `index.html` for the landing page, `app.html` for the OS itself, or:

```bash
npx serve .
```

## Structure
```
index.html        landing page (marketing, SEO)
app.html          the app itself
css/style.css     all styles (macOS-style light theme)
js/icons.js       SVG icon set
js/content.js     message templates and reply playbook (customize these!)
js/app.js         all app logic
js/config.js      deployment config (Supabase URL + anon key)
js/auth.js        accounts: login gate + cloud sync (live site only)
api/ingest.js     Vercel serverless: stores imported lists (Supabase)
api/ai.js         Vercel serverless: hosted Claude brain (optional)
sample_leads.csv  demo file for testing the importer
LAUNCH_GUIDE.md   step by step: GitHub, Vercel, backend
```

## Design language (keep it consistent)
Color always means the same thing:
- Filled blue: logging real work (Next action, Focus done)
- Blue to indigo gradient: sealing the day, nowhere else
- Tinted blue: opens LinkedIn
- Graphite: data utilities (import)
- Tinted green: money moves (make client, MRR, money tiles)
- Grey outline: quiet utilities (copy, prep, close)
- Red tag: overdue or attention. Blue tag: routine due. Magenta: posts.

## Customize
- Targets and money goals: in-app, menu (⋯) → Settings.
- Message copy: edit `js/content.js`.
- Brand colors: edit the `:root` block in `css/style.css`.
- `js/mydata.js` (optional, gitignored): private seed with your own leads,
  segments and templates. Loads locally, never ships.
