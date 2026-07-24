# Ascent Sourcing — setup

Paid, done-for-you prospect lists. Runs on **your** Apollo + Anthropic keys, gated by
a **server-side** prospect balance so users only get what they paid for. Payments via Paddle.

Files: `api/sourcing.js` (gated engine), `api/paddle-webhook.js` (payment → balance),
Sourcing view in `js/app.js` (`renderSourcing`), sidebar tile in `app.html`.

## 1. Supabase — the balance table (run once, SQL editor)
```sql
create table if not exists sourcing_balance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prospects_remaining int not null default 0,
  updated_at timestamptz default now()
);
alter table sourcing_balance enable row level security;
-- users may READ their own balance; only the service key (server) ever writes it
create policy "read own balance" on sourcing_balance
  for select using (auth.uid() = user_id);
```

## 2. Vercel env vars (Settings → Environment Variables, then redeploy)
| Key | Value |
|---|---|
| `OWNER_APOLLO_KEY` | your Apollo API key (the account whose credits are spent) |
| `OWNER_ANTHROPIC_KEY` | your Anthropic API key (parses each request) |
| `PADDLE_WEBHOOK_SECRET` | signing secret from Paddle → Notifications |
| `PADDLE_PRICE_MAP` | JSON: `{"pri_starter":100,"pri_growth":250,"pri_scale":600}` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | already set |
| `SOURCING_ALLOWED_ORIGIN` | *(optional)* `https://os.getascent.co` to lock the endpoint |

Sourcing stays OFF (a friendly "not switched on yet" message) until `OWNER_APOLLO_KEY`
and `OWNER_ANTHROPIC_KEY` are set. You can swap those keys anytime — change the env var,
redeploy, done.

## 3. Paddle
1. Create 3 prices (Starter / Growth / Scale) in Paddle.
2. Put their **price IDs** in two places:
   - `SRC_PADDLE` in `js/app.js` (`{starter:"pri_…",growth:"pri_…",scale:"pri_…"}`)
   - `PADDLE_PRICE_MAP` env var (maps each price ID → prospect count)
3. Add Paddle.js to `app.html` `<head>` and init it (client-side token):
   ```html
   <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
   <script>Paddle.Environment.set("production");
     Paddle.Setup({ token: "live_xxx" });</script>
   ```
4. Paddle → Notifications → add a webhook to `https://os.getascent.co/api/paddle-webhook`,
   copy the signing secret into `PADDLE_WEBHOOK_SECRET`.
5. The checkout already passes the logged-in user's id as `customData.user_id`
   (`srcCheckout` in `js/app.js`), so the webhook credits the right account automatically.

## How it works
- **Balance** lives only in `sourcing_balance` (server-authoritative — a user can't edit
  localStorage to give themselves prospects).
- **Source flow:** user describes their ICP → `api/sourcing` verifies their login, checks
  balance, parses with your Claude key, searches + enriches with your Apollo key, delivers
  up to the remaining balance, and **deducts the delivered count**.
- **Credit-smart:** the client sends the user's existing leads (name+company) as `exclude`,
  so people they already have are skipped **before** enrichment — the user's balance only
  spends on genuinely new prospects.
- **Out of prospects** → the console flips back to the pricing packs.

## Local note
On `file://` (your Mac) there's no login, so Sourcing shows a "runs on your live account"
message. It's fully live only on `os.getascent.co` where accounts exist.
