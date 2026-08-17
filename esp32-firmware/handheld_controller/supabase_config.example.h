#pragma once
/*
  Supabase credentials for the handset.

  Copy this file to supabase_config.h and paste your project's values. The real
  file is gitignored — the same arrangement web/.env.local uses.

  Both values come from the Supabase dashboard:
    Project Settings -> API -> Project URL, and the publishable (anon) key.

  ⚠ Use the PUBLISHABLE / ANON key, never the SERVICE ROLE key. The service key
  bypasses row level security, so on a handset it would expose every account's
  rovers to whoever is holding the device.
*/

#define SUPABASE_URL       "https://your-project-ref.supabase.co"
#define SUPABASE_ANON_KEY  "paste-the-publishable-anon-key-here"
