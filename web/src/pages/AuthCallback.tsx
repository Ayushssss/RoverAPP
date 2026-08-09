import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import Aurora from '../components/reactbits/Aurora';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { RoverMark } from '../components/AppShell';

/**
 * Where Google and the email links come back to.
 *
 * supabase-js does the work: with `detectSessionInUrl` it reads the `?code=`
 * this page was opened with, exchanges it for a session, and cleans the URL
 * itself. The result arrives here as an ordinary auth state change.
 *
 * Nothing here touches the URL before that happens.
 *
 * An earlier version called `history.replaceState` on mount to get the code out
 * of the address bar. That is a synchronous write racing an asynchronous
 * exchange, and it won: the code was gone before supabase-js could read it, so
 * no session was ever created and every sign-in failed at this screen. If the
 * code needs scrubbing, it can only be scrubbed *after* the session lands —
 * and supabase-js already does it.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { loading, user } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  /**
   * Providers report failure by redirecting back with the reason attached —
   * in the query for PKCE, in the fragment for the implicit flow. Read once,
   * on mount, before supabase-js tidies up.
   */
  const [providerError] = useState(() => {
    const fromQuery = new URLSearchParams(window.location.search);
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const pick = (key: string) => fromQuery.get(key) ?? fromHash.get(key);
    const description = pick('error_description');
    const code = pick('error') ?? pick('error_code');
    if (!description && !code) return null;
    return description?.replace(/\+/g, ' ') ?? code;
  });

  useEffect(() => {
    // Generous, because the exchange is a network round trip and a cold start
    // on a slow connection is not a failure. Only used to stop spinning
    // forever when something genuinely went wrong.
    const timer = window.setTimeout(() => setTimedOut(true), 15000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && user) navigate('/fleet', { replace: true });
  }, [loading, user, navigate]);

  const failed = Boolean(providerError) || (timedOut && !user);

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
      <Aurora intensity={0.6} />

      <div className="relative z-10 w-full max-w-md text-center">
        <div className="flex justify-center">
          <RoverMark size={34} />
        </div>

        {failed ? (
          <div className="mt-5">
            <ShieldAlert size={24} className="mx-auto text-bad-tint" />
            <h1 className="mt-3 text-xl font-bold">That sign-in did not complete</h1>

            {/* The provider's own words. Vague failures here are unfixable —
                "redirect_uri_mismatch" tells you exactly what to go and change,
                and hiding it behind a generic message helps nobody. */}
            {providerError && (
              <p className="mx-auto mt-3 max-w-sm rounded-2xl border border-line bg-sunken/60 px-4 py-3 text-left text-xs leading-relaxed text-bad-tint">
                {providerError}
              </p>
            )}

            {!providerError && (
              <p className="mx-auto mt-3 max-w-sm text-sm text-ink-dim">
                The provider sent you back, but no session came with it. The usual cause is this
                address not being listed under <span className="tnum">Redirect URLs</span> in the
                Supabase dashboard.
              </p>
            )}

            <p className="mx-auto mt-3 max-w-sm text-xs text-ink-muted">
              This page expects to be reached at{' '}
              <span className="tnum text-ink-dim">{window.location.origin}/auth/callback</span>
            </p>

            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={() => navigate('/login', { replace: true })}>Back to sign in</Button>
              <Link to="/">
                <Button variant="ghost">Home</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-3">
            <Loader2 size={22} className="animate-spin text-primary-tint" />
            <p className="text-sm text-ink-dim">Finishing sign-in…</p>
          </div>
        )}
      </div>
    </div>
  );
}
