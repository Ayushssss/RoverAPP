import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase, optionally.
 *
 * Without it the console still drives rovers — the relay carries the live path
 * and rovers cache locally. With it you get accounts, recorded telemetry, and a
 * fleet that follows you between machines.
 *
 * Absent config, every function here returns null and the UI hides what depends
 * on it rather than showing controls that fail when pressed.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

export function db(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (client) return client;

  client = createClient(URL!, KEY!, {
    auth: {
      // The session is the identity now, so it must survive a reload — and an
      // OAuth redirect comes back with the tokens in the URL fragment, which
      // detectSessionInUrl is what consumes.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return client;
}

/*
  There is deliberately no `x-rover-owner` header here any more.

  Migration 0001 scoped rows by that header, which isolated users but
  authenticated none of them — the client chose the value. 0002 moved the
  policies onto `auth.uid()`, read from a signed JWT that supabase-js attaches
  itself. Re-adding a client-supplied identity header would put the hole back.
*/

export interface DbRover {
  id: string;
  owner_id: string;
  name: string;
  mac_address: string;
  cluster: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TelemetrySample {
  id: number;
  rover_id: string;
  readings: Record<string, number>;
  source_mac: string | null;
  recorded_at: string;
}
