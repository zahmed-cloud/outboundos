/* Deployment config. Filled after creating the Supabase project.
   With url + anon set, accounts are REQUIRED on the live (http/https) site and
   each user's pipeline syncs to their account. file:// on your Mac stays open
   (local mode) regardless. The anon key is safe to ship: it's public by design
   and row-level security does the protecting. */
window.AUTH_CFG = {
  url: "https://iscnsdlknddikgqzcmgi.supabase.co",
  anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzY25zZGxrbmRkaWtncXpjbWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzA0MzgsImV4cCI6MjEwMDE0NjQzOH0.sYZLGQhwKx_aESbD2PqtkV1B3bMoEDNVLmBmgKMf4DQ",
  google: false     // set true after enabling the Google provider in Supabase
};
