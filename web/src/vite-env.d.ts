/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Absent means the console runs relay-only. */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable (not service-role) key — RLS is what scopes rows. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * The WebSocket relay (`../../relay`), not the socket.io one. Defaults to
   * http://localhost:8080. Settings overrides it at runtime.
   */
  readonly VITE_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
