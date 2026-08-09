import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import * as auth from '../services/auth';
import type { Profile } from '../services/auth';
import { clearLocalFleet, setIdentity } from '../lib/store';
import { reconnect, disconnect } from '../services/relay';

/**
 * Who is signed in, for the whole app.
 *
 * This is the only place that pushes identity into the rest of the system: the
 * store gets it so the relay knows what token to open a socket with, and the
 * socket is re-dialled whenever the account changes. Leaving that to individual
 * pages is how you end up with one screen still talking as the previous user.
 */

interface AuthState {
  /** Null until the stored session has been read — distinct from signed out. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  displayName: string;
  avatarUrl: string | null;
  configured: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const state = useContext(Ctx);
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>');
  return state;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const user = session?.user ?? null;

  const loadProfile = useCallback(async (id: string) => {
    setProfile(await auth.fetchProfile(id));
  }, []);

  useEffect(() => {
    if (!auth.authConfigured) {
      setLoading(false);
      return;
    }

    let alive = true;

    // Fires once with the restored session shortly after subscribing, which is
    // what rehydrates a reload, and again on every sign-in, sign-out and token
    // refresh. One subscription covers all of it.
    const unsubscribe = auth.onAuthChange((next) => {
      if (!alive) return;
      setSession(next);
      setLoading(false);
    });

    // Belt and braces: if the listener has not fired by the time the stored
    // session resolves, this releases the loading gate so the app cannot hang
    // on a blank screen.
    auth.getSession().then((initial) => {
      if (!alive) return;
      setSession((current) => current ?? initial);
      setLoading(false);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // Identity flows outward from here. The relay is re-dialled rather than left
  // open, because a socket opened as the previous user keeps that user's rooms.
  useEffect(() => {
    if (!user) {
      setIdentity(null);
      setProfile(null);
      disconnect();
      return;
    }
    setIdentity({
      userId: user.id,
      label: auth.displayNameOf(user, null),
    });
    reconnect();
    void loadProfile(user.id);
  }, [user?.id, loadProfile]);

  const signOut = useCallback(async () => {
    await auth.signOut();
    // The cache is per-account; leaving it would show the previous person's
    // rovers to whoever signs in next on this machine.
    clearLocalFleet();
    setIdentity(null);
    setProfile(null);
    disconnect();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user,
      profile,
      displayName: auth.displayNameOf(user, profile),
      avatarUrl: auth.avatarOf(user, profile),
      configured: auth.authConfigured,
      signOut,
      refreshProfile,
    }),
    [loading, session, user, profile, signOut, refreshProfile]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
