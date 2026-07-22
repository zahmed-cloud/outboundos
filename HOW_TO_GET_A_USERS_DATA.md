# How to get (and give back) a user's data

Plain-English guide. No file backups needed anymore — every user's data is saved
in your Supabase automatically. This is how you pull it when someone asks.

---

## Where user data lives (2 places)

| Table | What's in it |
|-------|--------------|
| **`user_state`** | Each user's **complete** account — all their leads AND their full pipeline, progress, streak, notes. One row per person. This is everything. |
| **`lead_uploads`** | A copy of every lead list anyone ever imported (a history log). |

You never have to do anything for this to happen — the app saves it all every ~10
seconds while people work.

---

## Someone asks for their data — do this (about 30 seconds)

1. Go to **supabase.com** → open your Outbound OS project.
2. Left sidebar → **SQL Editor** → **New query**.
3. Paste this, swap in their email, and hit **Run**:

```sql
select u.email, s.leads, s.app, s.updated_at
from auth.users u
join user_state s on s.user_id = u.id
where u.email = 'their@email.com';
```

4. The result row is their **full data**:
   - `leads` = all their leads
   - `app` = all their progress (pipeline, streak, notes, everything)
   - `updated_at` = when they last used it

Click a cell to see the full contents. That's their complete account, ready to
hand over.

---

## Giving data BACK to a user

Two ways, depending on what they need:

- **Just their leads** (easiest): send them the `leads` part, they re-import it
  through **Import leads (CSV)** in the app. Self-serve.
- **Their whole account** (leads + all progress): you paste their full snapshot
  back into their row in **Table Editor → `user_state`**. This restores
  everything exactly as it was.

---

## Deleting a user's data (if they ask)

Per your privacy policy, people can email you to delete their account. To do it:

1. Supabase → **Authentication** → **Users** → find them by email → delete the user.
   (This automatically removes their `user_state` row too.)
2. Optional: Supabase → **SQL Editor** to also clear their upload history:
   ```sql
   -- only if you want to wipe their import logs too (they aren't linked to the account)
   -- there is no user column on lead_uploads, so match by hand if needed
   ```

---

## Quick map of where things are in Supabase

- **Authentication → Users** = the list of everyone who signed up (email, name, when).
- **Table Editor → user_state** = each person's actual saved account.
- **Table Editor → lead_uploads** = every import anyone has done.
- **SQL Editor** = where you run the query above.

That's it. You hold everyone's complete data, it's automatic, and you can always
give it back or delete it on request.
