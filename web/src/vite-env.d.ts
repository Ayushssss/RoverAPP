/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Absent means the console runs relay-only. */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable (not service-role) key — RLS is what scopes rows. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
