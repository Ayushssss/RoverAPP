/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Absent means the console runs relay-only. */
  readonly VITE_SUPABASE_URL?: string;
  /** Publishable (not service-role) key — RLS is what scopes rows. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * Relay address. Defaults to the deployed socket.io relay. Must match
   * VITE_RELAY_TRANSPORT. Settings overrides it at runtime.
   */
  readonly VITE_RELAY_URL?: string;
  /**
   * `ws` selects the Supabase-authenticated relay in ../../relay; anything
   * else (including unset) keeps the socket.io transport the deployed relay
   * and the mobile app speak.
   */
  readonly VITE_RELAY_TRANSPORT?: 'socketio' | 'ws';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
