import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, LogOut, Mail, Fingerprint, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { AnimatedContent } from '../components/reactbits/Motion';
import { SplitText, DecryptedText } from '../components/reactbits/Text';
import Button from '../components/ui/Button';
import { Badge, Divider, Field, Input, Micro } from '../components/ui/Bits';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { updateProfile } from '../services/auth';
import Avatar from '../components/Avatar';

export default function Profile() {
  const { user, displayName, avatarUrl, refreshProfile, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);

  // The profile row is fetched after the first render, so the field has to
  // follow it in rather than latching whatever was there at mount.
  useEffect(() => setName(displayName), [displayName]);

  if (!user) return null;

  const save = async () => {
    setSaving(true);
    try {
      // Cleared rather than blanked: an empty string would be shown as the
      // name, whereas null lets `displayNameOf` fall back to the email.
      await updateProfile(user.id, { display_name: name.trim() || undefined });
      await refreshProfile();
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
    setSaving(false);
  };

  const provider = user.app_metadata?.provider ?? 'email';

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <AnimatedContent>
          <Micro className="text-primary-tint">Account</Micro>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            <SplitText text="Profile" />
          </h1>
        </AnimatedContent>

        <div className="mt-8 space-y-6">
          <AnimatedContent delay={0.06}>
            <section className="rounded-card border border-line bg-surface p-6">
              <div className="flex items-center gap-4">
                <Avatar src={avatarUrl} name={displayName} size={64} />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold">{displayName}</h2>
                  <p className="truncate text-sm text-ink-dim">{user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="primary">
                      {provider === 'google' ? 'Google account' : 'Email account'}
                    </Badge>
                    {user.email_confirmed_at ? (
                      <Badge tone="ok">Verified</Badge>
                    ) : (
                      <Badge tone="accent">Unverified</Badge>
                    )}
                  </div>
                </div>
              </div>

              <Divider className="my-6" />

              <Field label="Display name" hint="Shown in the header and on this page.">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>

              <div className="mt-5">
                <Button onClick={save} disabled={saving || name.trim() === displayName}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </Button>
              </div>
            </section>
          </AnimatedContent>

          <AnimatedContent delay={0.12}>
            <section className="rounded-card border border-line bg-surface p-6">
              <h2 className="text-lg font-bold">Identity</h2>
              <p className="mt-1.5 text-sm text-ink-dim">
                This id owns your rovers and their telemetry, and is the token the relay sees.
              </p>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-ink-dim">
                    <Mail size={14} />
                    Email
                  </dt>
                  <dd className="min-w-0 truncate text-ink-2">{user.email}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-2 text-ink-dim">
                    <Fingerprint size={14} />
                    User id
                  </dt>
                  <dd className="min-w-0 truncate">
                    <DecryptedText text={user.id} className="tnum text-xs text-ink-muted" />
                  </dd>
                </div>
              </dl>
            </section>
          </AnimatedContent>

          {/* Sign out sits in its own block, away from the save button. A
              destructive-ish action next to a routine one gets mis-clicked. */}
          <AnimatedContent delay={0.18}>
            <section className="rounded-card border border-line bg-surface p-6">
              <h2 className="text-lg font-bold">Session</h2>
              <p className="mt-1.5 text-sm text-ink-dim">
                Signing out closes the relay connection and clears this browser's cached fleet. Your
                rovers and history stay on your account.
              </p>
              <Button
                variant="danger"
                className="mt-5"
                onClick={async () => {
                  await signOut();
                  navigate('/', { replace: true });
                }}
              >
                <LogOut size={16} />
                Sign out
              </Button>
            </section>
          </AnimatedContent>
        </div>
      </motion.div>
    </AppShell>
  );
}
