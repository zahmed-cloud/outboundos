# Ascent Sourcing — setup

Paid, done-for-you prospect lists. Runs on **your** Apollo + Anthropic keys, gated by
a **server-side** prospect balance so users only get what they paid for. Payments via Paddle.

Files: `api/sourcing.js` (gated engine), `api/paddle-webhook.js` (payment → balance),
Sourcing view in `js/app.js` (`renderSourcing`), sidebar tile in `app.html`.

## 1. Supabase — the balance table (run once, SQL editor)
```sql
create table if not exists sourcing_balance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,                        -- shown in the table editor so you know who is who
  name text,
  prospects_remaining int not null default 0,   -- edit THIS box to top someone up
  prospects_used int not null default 0,        -- how many they've sourced so far
  updated_at timestamptz default now()
);
-- if the table already existed, add the new columns:
alter table sourcing_balance add column if not exists email text;
alter table sourcing_balance add column if not exists name text;
alter table sourcing_balance add column if not exists prospects_used int not null default 0;

alter table sourcing_balance enable row level security;
-- users may READ their own balance; only the service key (server) ever writes it
create policy "read own balance" on sourcing_balance
  for select using (auth.uid() = user_id);

-- backfill everyone who already signed up (so they show in the table now)
insert into sourcing_balance (user_id, email, name)
select id, email, coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')
from auth.users
on conflict (user_id) do update set email = excluded.email, name = excluded.name;

-- AUTO-ADD every new signup to the table, instantly
create or replace function add_to_sourcing_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into sourcing_balance (user_id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''))
  on conflict (user_id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_sourcing on auth.users;
create trigger on_auth_user_created_sourcing
  after insert on auth.users for each row execute function add_to_sourcing_balance();

-- owner key store: powers the in-app Admin panel (change Apollo/Claude keys with
-- no redeploy). LOCKED to clients — only the service key (server) reads/writes it.
create table if not exists owner_config (
  id int primary key default 1,
  apollo_key text,
  anthropic_key text,
  updated_at timestamptz default now()
);
alter table owner_config enable row level security;   -- no policies = clients get nothing
```

## 1b. Managing prospects visually (no SQL — just edit the table)
Everyone who signs up and opens **Sourcing** automatically gets a row in the
`sourcing_balance` table, filled with their **name + email**. To manage them:

**Supabase → Table Editor → `sourcing_balance`.** You'll see a grid like:

| name | email | prospects_remaining | prospects_used |
|---|---|---|---|
| Jane Doe | jane@acme.com | 0 | 0 |
| Sam Ito | sam@reppy.io | 118 | 132 |

- **To top someone up:** click their **`prospects_remaining`** cell, type the number
  (e.g. `250` for Growth, or any number), press Enter. Done — they refresh Sourcing
  and it's there. Type the total you want them to have.
- **To see usage:** `prospects_used` shows how many they've already sourced, so you
  know who to upsell.
- **Adding more later:** they have `118` left, buy `250` more → set the cell to `368`.

That's it — a spreadsheet you edit by hand. (They must have signed up with that email
and opened Sourcing once for their row to appear.)

## 2. Vercel env vars (Settings → Environment Variables, then redeploy)
| Key | Value |
|---|---|
| `OWNER_EMAIL` | the email you log into the tool with — unlocks the in-app Admin panel |
| `OWNER_APOLLO_KEY` | *(optional)* Apollo key fallback; the Admin panel overrides this |
| `OWNER_ANTHROPIC_KEY` | *(optional)* Claude key fallback; the Admin panel overrides this |
| `PADDLE_WEBHOOK_SECRET` | signing secret from Paddle → Notifications |
| `PADDLE_PRICE_MAP` | JSON: `{"pri_starter":100,"pri_growth":250,"pri_scale":600}` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | already set |
| `SOURCING_ALLOWED_ORIGIN` | *(optional)* `https://os.getascent.co` to lock the endpoint |

### Admin panel (recommended way to manage keys)
Set `OWNER_EMAIL`, log into the tool with that account, open **Sourcing**, and click
**⚙ Keys** (only you see it). Paste your Apollo + Claude keys → Save → live instantly,
no redeploy. The panel never shows a key back — only "set ✓". Change them anytime from
there. `OWNER_APOLLO_KEY` / `OWNER_ANTHROPIC_KEY` env vars are just an optional fallback.

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
