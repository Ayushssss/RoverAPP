import type { Session, User } from '@supabase/supabase-js';
import { db, supabaseConfigured } from './supabase';

/**
 * Authentication.
 *
 * Supabase Auth issues a signed JWT that supabase-js attaches to every request,
 * which is what lets the RLS policies in migration 0002 read `auth.uid()` and
 * trust it. The identity is no longer a string the client picks — it is proven.
 *
 * That same user id doubles as the relay's token, so one sign-in covers both
 * halves of the system.
 */

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export class AuthUnavailable extends Error {
  constructor() {
    super(
      'Authentication needs Supabase. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    );
    this.name = 'AuthUnavailable';
  }
}

function client() {
  const c = db();
  if (!c) throw new AuthUnavailable();
  return c;
}

export const authConfigured = supabaseConfigured;

export async function getSession(): Promise<Session | null> {
  if (!supabaseConfigured) return null;
  const { data } = await client().auth.getSession();
  return data.session;
}

/**
 * Fires on sign-in, sign-out, and token refresh.
 *
 * Also fires once shortly after subscribing with the restored session, which is
 * what rehydrates the app on a reload without a separate initial fetch.
 */
export function onAuthChange(listener: (session: Session | null) => void): () => void {
  if (!supabaseConfigured) {
    listener(null);
    return () => {};
  }
  const { data } = client().auth.onAuthStateChange((_event, session) => listener(session));
  return () => data.subscription.unsubscribe();
}

export interface SignUpResult {
  user: User | null;
  /**
   * True when the project requires email confirmation, which it does by
   * default. The account exists but cannot sign in until the link is followed,
   * and saying so is the difference between "check your inbox" and a wrong
   * password message the user cannot act on.
   */
  needsConfirmation: boolean;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName: string
): Promise<SignUpResult> {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    options: {
      // Read by the handle_new_user trigger to seed the profile row.
      data: { display_name: displayName.trim() },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;

  // Supabase returns a user with no session when confirmation is pending.
  return { user: data.user, needsConfirmation: !data.session };
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await client().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data.session;
}

/**
 * Google, via redirect.
 *
 * Redirect rather than a popup: popups are blocked often enough on mobile
 * Safari that the button would silently do nothing. This navigates away and
 * comes back to `/auth/callback`.
 *
 * Requires the Google provider to be enabled on the Supabase project — without
 * it this call returns a "provider is not enabled" error, which the caller
 * surfaces rather than swallowing.
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

/**
 * Which social providers the project actually has switched on.
 *
 * GoTrue publishes this unauthenticated at `/auth/v1/settings`. Asking up front
 * is what lets the sign-in page avoid offering a button that can only fail —
 * and it needs no redeploy when a provider is enabled later, because the answer
 * is read live rather than compiled in.
 *
 * Failure is treated as "enabled": a network blip should not hide a working
 * sign-in route, and the click path already reports the real error.
 */
export async function enabledProviders(): Promise<Record<string, boolean>> {
  if (!supabaseConfigured) return {};
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
    });
    if (!res.ok) return {};
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return body.external ?? {};
  } catch {
    return {};
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/auth/callback`,
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabaseConfigured) return;
  await client().auth.signOut();
}

/* ── profile ──────────────────────────────────────────────────────── */

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await client()
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[auth] fetchProfile:', error.message);
    return null;
  }
  return data as Profile | null;
}

export async function updateProfile(
  userId: string,
  patch: { display_name?: string; avatar_url?: string | null }
): Promise<void> {
  const { error } = await client().from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

/**
 * What to call somebody, best effort.
 *
 * The profile row is authoritative, but it is created by a trigger that a fresh
 * OAuth redirect can outrun, so the user's own metadata is the fallback and the
 * email local-part is the last resort. Never shows a raw uuid.
 */
export function displayNameOf(user: User | null, profile: Profile | null): string {
  return (
    profile?.display_name ||
    (user?.user_metadata?.display_name as string | undefined) ||
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Operator'
  );
}

export function avatarOf(user: User | null, profile: Profile | null): string | null {
  return (
    profile?.avatar_url ||
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null
  );
}
