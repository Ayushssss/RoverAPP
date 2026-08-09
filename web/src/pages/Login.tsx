import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Loader2, MailCheck, ShieldAlert } from 'lucide-react';
import Aurora from '../components/reactbits/Aurora';
import DotGrid from '../components/reactbits/DotGrid';
import { SplitText } from '../components/reactbits/Text';
import { Field, Input, Micro } from '../components/ui/Bits';
import Button from '../components/ui/Button';
import { RoverMark } from '../components/AppShell';
import * as auth from '../services/auth';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/cn';

type Mode = 'signin' | 'signup' | 'reset';

/** Google's mark, inline. An external image would be blocked and leak a hit. */
function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

/**
 * The way in.
 *
 * Three modes share one card rather than three routes, because the fields
 * mostly overlap and a full navigation between "sign in" and "sign up" loses
 * whatever was already typed.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<null | 'password' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | 'confirm' | 'reset'>(null);
  /**
   * Undefined until the project's provider list arrives.
   *
   * Optimistic on purpose: the button renders immediately and is only withdrawn
   * if the project says Google is off. The reverse — hiding it until confirmed —
   * would make the primary sign-in route flicker in on every page load.
   */
  const [googleOn, setGoogleOn] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    auth.enabledProviders().then((providers) => {
      // An empty map means the lookup failed; leave the button alone.
      if (alive && Object.keys(providers).length > 0) setGoogleOn(providers.google === true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const to = (location.state as { from?: string } | null)?.from ?? '/fleet';

  if (!auth.authConfigured) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5">
        <div className="max-w-md rounded-sheet border border-line bg-surface p-7 text-center">
          <ShieldAlert size={26} className="mx-auto text-accent-tint" />
          <h1 className="mt-4 text-xl font-bold">Accounts need Supabase</h1>
          <p className="mt-2 text-sm text-ink-dim">
            Set <span className="tnum">VITE_SUPABASE_URL</span> and{' '}
            <span className="tnum">VITE_SUPABASE_PUBLISHABLE_KEY</span>, then run the migrations in{' '}
            <span className="tnum">web/supabase/migrations</span>.
          </p>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('password');

    try {
      if (mode === 'reset') {
        await auth.sendPasswordReset(email);
        setSent('reset');
      } else if (mode === 'signup') {
        const result = await auth.signUpWithPassword(email, password, name);
        if (result.needsConfirmation) setSent('confirm');
        else {
          toast.success('Account created');
          navigate(to, { replace: true });
        }
      } else {
        await auth.signInWithPassword(email, password);
        toast.success('Signed in');
        navigate(to, { replace: true });
      }
    } catch (err) {
      // Supabase's messages are already user-facing ("Invalid login
      // credentials", "Password should be at least 6 characters"), so they are
      // shown rather than replaced with something vaguer.
      setError(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setError(null);
    setBusy('google');
    try {
      // Navigates away on success; nothing after this line runs in that case.
      await auth.signInWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(
        /provider is not enabled/i.test(message)
          ? 'Google sign-in is not enabled on this project yet.'
          : message
      );
      setBusy(null);
    }
  };

  if (sent) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5">
        <Aurora intensity={0.7} />
        <DotGrid />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rim relative z-10 w-full max-w-md rounded-sheet p-7 text-center elev-3"
        >
          <MailCheck size={30} className="mx-auto text-ok-tint" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-dim">
            {sent === 'confirm' ? (
              <>
                A confirmation link is on its way to <span className="text-ink">{email}</span>. The
                account exists but cannot sign in until you follow it.
              </>
            ) : (
              <>
                If <span className="text-ink">{email}</span> has an account, a reset link is on its
                way.
              </>
            )}
          </p>
          <Button
            variant="secondary"
            className="mt-6 w-full"
            onClick={() => {
              setSent(null);
              setMode('signin');
            }}
          >
            Back to sign in
          </Button>
        </motion.div>
      </div>
    );
  }

  const heading =
    mode === 'signin' ? 'Sign in to the console.' : mode === 'signup' ? 'Create an account.' : 'Reset your password.';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-12"
    >
      <Aurora intensity={0.7} />
      <DotGrid />

      <div className="relative z-10 w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back
        </Link>

        <div className="glass rim rounded-sheet p-7 elev-3">
          <RoverMark size={32} />
          <h1 className="mt-5 text-2xl font-bold tracking-tight">
            <SplitText key={mode} text={heading} />
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-dim">
            {mode === 'reset'
              ? 'We will email you a link to set a new one.'
              : 'Your account owns your fleet and its recorded telemetry.'}
          </p>

          {mode !== 'reset' && googleOn !== false && (
            <>
              <Button
                variant="secondary"
                size="lg"
                className="mt-6 w-full"
                onClick={google}
                disabled={busy !== null}
              >
                {busy === 'google' ? <Loader2 size={17} className="animate-spin" /> : <GoogleIcon />}
                Continue with Google
              </Button>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <Micro>or</Micro>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          {/* Said out loud rather than by simply omitting the button: somebody
              who came here expecting Google should learn why it is missing,
              not quietly conclude the app never had it. Disappears on its own
              once the provider is switched on — no redeploy. */}
          {mode !== 'reset' && googleOn === false && (
            <div className="mt-6 flex gap-2.5 rounded-2xl border border-line bg-sunken/60 p-3.5">
              <ShieldAlert size={15} className="mt-0.5 shrink-0 text-accent-tint" />
              <p className="text-xs leading-relaxed text-ink-muted">
                Google sign-in is not enabled on this project yet. Use an email address below, or
                turn the provider on in the Supabase dashboard.
              </p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            <AnimatePresence initial={false}>
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden"
                >
                  <Field label="Name">
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Field station"
                      autoComplete="name"
                    />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>

            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                autoComplete="email"
                spellCheck={false}
              />
            </Field>

            {mode !== 'reset' && (
              <Field
                label="Password"
                error={error}
                hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
              >
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </Field>
            )}

            {mode === 'reset' && error && <p className="text-xs text-bad-tint">{error}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={busy !== null}>
              {busy === 'password' ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Working…
                </>
              ) : (
                <>
                  {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
                  <ArrowRight size={17} />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError(null);
              }}
              className="cursor-pointer text-ink-dim transition-colors hover:text-ink"
            >
              {mode === 'signup' ? 'Already have an account?' : 'Create an account'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'reset' ? 'signin' : 'reset');
                setError(null);
              }}
              className={cn(
                'cursor-pointer text-ink-dim transition-colors hover:text-ink',
                mode === 'signup' && 'hidden'
              )}
            >
              {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
