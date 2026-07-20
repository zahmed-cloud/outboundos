/* Deployment config. Fill these after creating your Supabase project
   (LAUNCH_GUIDE.md step 3.6) and accounts become REQUIRED on the live site.
   Leave empty and the app runs open (local mode) — file:// on your Mac is
   always local mode regardless. The anon key is safe to ship: it's public
   by design and row-level security does the protecting. */
window.AUTH_CFG = {
  url: "",          // e.g. "https://xxxx.supabase.co"
  anon: "",         // the anon/public key from Supabase → Settings → API
  google: false     // set true after enabling the Google provider in Supabase
};
