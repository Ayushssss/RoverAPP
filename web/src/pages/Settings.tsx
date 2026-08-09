import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Palette, Radio, Save, Activity } from 'lucide-react';
import AppShell from '../components/AppShell';
import { AnimatedContent } from '../components/reactbits/Motion';
import { SplitText } from '../components/reactbits/Text';
import Button from '../components/ui/Button';
import { Badge, Divider, Field, Input, Micro, PulseDot } from '../components/ui/Bits';
import { useToast } from '../components/ui/Toast';
import { getPrefs, getScheme, setPrefs, setScheme } from '../lib/store';
import type { SchemeId } from '../lib/store';
import { useAuth } from '../context/AuthContext';
import * as relay from '../services/relay';
import { cn } from '../lib/cn';

/**
 * The five schemes, seeded the same way the mobile app seeds them, so a rover
 * looks like the same machine on both. Swatches are literal — the picker shows
 * the colours, not a name for them.
 */
const SCHEMES: Array<{ id: SchemeId; name: string; blurb: string; swatch: [string, string] }> = [
  { id: 'terracotta', name: 'Terracotta', blurb: 'Warm earth, gold hardware', swatch: ['#B8532E', '#D4A53A'] },
  { id: 'midnight', name: 'Midnight', blurb: 'Cool indigo, cyan signal', swatch: ['#2563EB', '#22D3EE'] },
  { id: 'meadow', name: 'Meadow', blurb: 'Growing green, dry grass', swatch: ['#2F8F57', '#A3B324'] },
  { id: 'ember', name: 'Ember', blurb: 'Hot orange over charred red', swatch: ['#C2410C', '#EAB308'] },
  { id: 'slate', name: 'Slate', blurb: 'Near-monochrome, one indigo accent', swatch: ['#4F46E5', '#94A3B8'] },
];

export default function Settings() {
  const { user, displayName } = useAuth();
  const toast = useToast();
  const prefs = getPrefs();
  const [scheme, setLocalScheme] = useState<SchemeId>(getScheme);
  const [relayUrl, setRelayUrl] = useState(prefs.relay);
  const [relayOverride, setRelayOverride] = useState(prefs.relayIdentity ?? '');
  const [link, setLink] = useState(relay.getLinkState());

  // The badge tracks live state rather than latching, so it can't claim the
  // relay is up after it has actually dropped.
  useEffect(() => relay.onLinkState(setLink), []);

  const pick = (id: SchemeId) => {
    setLocalScheme(id);
    setScheme(id);
  };

  const save = () => {
    let origin: string;
    try {
      origin = new URL(relayUrl.trim()).origin;
    } catch {
      toast.error('That relay address is not a URL');
      return;
    }
    const override = relayOverride.trim();
    const changed = origin !== prefs.relay || override !== (prefs.relayIdentity ?? '');

    setPrefs({ relay: origin, relayIdentity: override || undefined });

    if (changed) {
      // Either change points the socket somewhere new. Nothing re-dials itself,
      // so do it here rather than leaving a live-looking connection to a host —
      // or an identity — the user just replaced.
      relay.reconnect();
      toast.success('Saved — re-dialling');
    } else {
      toast.success('Saved');
    }
  };

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <AnimatedContent>
          <Micro className="text-primary-tint">Console</Micro>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            <SplitText text="Settings" />
          </h1>
        </AnimatedContent>

        <div className="mt-8 space-y-6">
          {/* ── scheme ── */}
          <AnimatedContent delay={0.06}>
            <section className="rounded-card border border-line bg-surface p-6">
              <div className="flex items-center gap-2">
                <Palette size={17} className="text-primary-tint" />
                <h2 className="text-lg font-bold">Colour scheme</h2>
              </div>
              <p className="mt-1.5 text-sm text-ink-dim">
                Applied instantly and remembered. Components read roles, never hex, which is why the
                whole console re-skins without a reload.
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SCHEMES.map((s) => {
                  const active = scheme === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => pick(s.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors duration-200',
                        active
                          ? 'border-primary/50 bg-primary-dim'
                          : 'border-line bg-raised hover:border-line-strong'
                      )}
                    >
                      <span className="flex shrink-0 -space-x-2">
                        {s.swatch.map((c) => (
                          <span
                            key={c}
                            className="h-7 w-7 rounded-full border-2 border-surface"
                            style={{ background: c }}
                          />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{s.name}</span>
                        <span className="block truncate text-[11px] text-ink-muted">{s.blurb}</span>
                      </span>
                      {/* Selection is never colour alone — the check is the
                          signal, the tint just reinforces it. */}
                      {active && <Check size={16} className="shrink-0 text-primary-tint" />}
                    </button>
                  );
                })}
              </div>
            </section>
          </AnimatedContent>

          {/* ── relay ── */}
          <AnimatedContent delay={0.12}>
            <section className="rounded-card border border-line bg-surface p-6">
              <div className="flex items-center gap-2">
                <Radio size={17} className="text-primary-tint" />
                <h2 className="text-lg font-bold">Relay</h2>
              </div>

              <Field
                className="mt-5"
                label="Relay address"
                hint="A LAN address cuts the round trip on the bench."
              >
                <Input mono value={relayUrl} onChange={(e) => setRelayUrl(e.target.value)} spellCheck={false} />
              </Field>

              <Divider className="my-5" />

              <Field
                label="Signed in as"
                hint="Your account owns the fleet and its telemetry. Change it from Profile."
              >
                <Input value={`${displayName} · ${user?.email ?? ''}`} readOnly disabled />
              </Field>

              {/*
                The escape hatch for a fleet paired on the phone.

                The mobile app authenticates through Clerk, so its user id is
                not this Supabase one, and a socket opened with the Supabase id
                joins rooms the phone's rovers never registered in. This points
                the relay — and only the relay — at that identity; the database
                stays scoped to the real account either way.
              */}
              <Field
                className="mt-5"
                label="Relay identity override"
                hint={
                  relayOverride.trim()
                    ? 'The socket will connect as this instead of your account.'
                    : 'Optional. Set this to reach rovers paired in the phone app.'
                }
              >
                <Input
                  mono
                  value={relayOverride}
                  onChange={(e) => setRelayOverride(e.target.value)}
                  placeholder={user?.id ?? ''}
                  spellCheck={false}
                />
              </Field>

              <div className="mt-5">
                <Button onClick={save}>
                  <Save size={16} />
                  Save
                </Button>
              </div>
            </section>
          </AnimatedContent>

          {/* ── diagnostics ── */}
          <AnimatedContent delay={0.18}>
            <section className="rounded-card border border-line bg-surface p-6">
              <div className="flex items-center gap-2">
                <Activity size={17} className="text-primary-tint" />
                <h2 className="text-lg font-bold">Link</h2>
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                {[
                  {
                    term: 'Socket',
                    value: (
                      <Badge tone={link === 'up' ? 'ok' : link === 'connecting' ? 'accent' : 'neutral'}>
                        <PulseDot
                          tone={link === 'up' ? 'ok' : link === 'connecting' ? 'accent' : 'muted'}
                          size={5}
                          halo={link === 'up'}
                        />
                        {link === 'up'
                          ? 'Connected'
                          : link === 'connecting'
                            ? 'Connecting'
                            : link === 'down'
                              ? 'Disconnected'
                              : 'Idle'}
                      </Badge>
                    ),
                  },
                  { term: 'Host', value: <span className="tnum text-ink-dim">{prefs.relay}</span> },
                  {
                    term: 'Connecting as',
                    value: (
                      <span className="tnum truncate text-ink-dim">
                        {prefs.relayIdentity?.trim() || user?.id}
                      </span>
                    ),
                  },
                  { term: 'Drive rate', value: <span className="tnum text-ink-dim">25 Hz</span> },
                  { term: 'Failsafe repeat', value: <span className="tnum text-ink-dim">250 ms</span> },
                ].map((row) => (
                  <div key={row.term} className="flex items-center justify-between gap-4">
                    <dt className="text-ink-dim">{row.term}</dt>
                    <dd className="min-w-0 truncate">{row.value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 text-xs leading-relaxed text-ink-muted">
                The rover cuts its motors after one second without input. The console re-sends the
                held vector four times a second, which sits comfortably inside that — if the tab is
                closed or the network drops mid-drive, the rover stops on its own.
              </p>
            </section>
          </AnimatedContent>
        </div>
      </motion.div>
    </AppShell>
  );
}
