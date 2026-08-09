import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  RefreshCw,
  Radio,
  Trash2,
  ArrowUpRight,
  Camera,
  Cpu,
  Gamepad2,
  X,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import { AnimatedContent } from '../components/reactbits/Motion';
import { SplitText, DecryptedText, CountUp } from '../components/reactbits/Text';
import Button, { IconButton } from '../components/ui/Button';
import { Badge, Empty, Field, Input, Micro, PulseDot } from '../components/ui/Bits';
import { useToast } from '../components/ui/Toast';
import * as relay from '../services/relay';
import type { BoardInfo } from '../services/relay';
import {
  addRover,
  isValidMac,
  listRovers,
  normalizeMac,
  removeRover,
  saveRover,
  syncRovers,
} from '../lib/store';
import type { Rover } from '../lib/store';
import { deleteRover, fetchRovers, upsertRover } from '../services/history';
import { supabaseConfigured } from '../services/supabase';

/**
 * Live presence for the whole fleet at once.
 *
 * Every rover is registered on the one socket and their rosters collected into
 * a single map, so the list can say what is *actually* on the relay rather than
 * showing every rover as an identical grey card and only finding out on the
 * control page.
 */
function useFleetPresence(rovers: Rover[]) {
  const [rosters, setRosters] = useState<Record<string, BoardInfo[]>>({});
  const [link, setLink] = useState(relay.getLinkState());
  const macs = rovers.map((r) => r.macAddress).join(',');

  useEffect(() => {
    let alive = true;
    const offState = relay.onLinkState((s) => alive && setLink(s));
    const cleanups: Array<() => void> = [];

    (async () => {
      try {
        await relay.acquire();
        if (!alive) return;
        for (const mac of macs ? macs.split(',') : []) {
          relay.registerRover(mac);
          cleanups.push(
            relay.onBoards(mac, (boards) =>
              alive && setRosters((prev) => ({ ...prev, [mac]: boards }))
            )
          );
        }
      } catch {
        /* link state already reflects it. */
      }
    })();

    return () => {
      alive = false;
      offState();
      cleanups.forEach((c) => c());
      relay.release();
    };
  }, [macs]);

  return { rosters, link };
}

const ROLE_ICON = { rover: Cpu, camera: Camera, sensor: Radio, controller: Gamepad2 } as const;

function RoverCard({
  rover,
  boards,
  onRemove,
}: {
  rover: Rover;
  boards: BoardInfo[] | undefined;
  onRemove: () => void;
}) {
  // `undefined` means the relay has not answered for this rover yet, which is
  // a different thing from "answered, and nothing is there". Saying "Offline"
  // during a cold start would be a lie that costs somebody a trip to the shed.
  const known = boards !== undefined;
  const online = (boards?.length ?? 0) > 0;

  return (
    <SpotlightCard className="group p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold tracking-tight text-ink">{rover.name}</h3>
          <DecryptedText text={rover.macAddress} className="tnum text-xs text-ink-muted" />
        </div>

        <IconButton
          icon={<Trash2 size={15} />}
          label={`Remove ${rover.name}`}
          tone="danger"
          onClick={onRemove}
          className="h-9 w-9 rounded-xl opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        {!known ? (
          <Badge tone="neutral">
            <PulseDot tone="muted" size={5} halo={false} />
            Checking…
          </Badge>
        ) : online ? (
          <Badge tone="ok">
            <PulseDot tone="ok" size={5} />
            {boards!.length} board{boards!.length === 1 ? '' : 's'} online
          </Badge>
        ) : (
          <Badge tone="neutral">
            <PulseDot tone="muted" size={5} halo={false} />
            No boards connected
          </Badge>
        )}
      </div>

      {online && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {boards!.map((b) => {
            const Icon = ROLE_ICON[b.role];
            return (
              <span
                key={b.mac}
                title={`${b.role} · ${b.ip}`}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-raised px-2 py-1 text-[11px] capitalize text-ink-dim"
              >
                <Icon size={12} className="text-ok-tint" />
                {b.role}
              </span>
            );
          })}
        </div>
      )}

      <Link to={`/rover/${rover.id}`} className="mt-5 block">
        <Button variant="secondary" className="w-full justify-between">
          Open console
          <ArrowUpRight size={16} />
        </Button>
      </Link>
    </SpotlightCard>
  );
}

function AddRoverSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [mac, setMac] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give it a name you will recognise in the field.');
    if (!isValidMac(mac)) return setError('A MAC is 12 hex digits — the drive board prints its own on boot.');

    const normalized = normalizeMac(mac);
    if (listRovers().some((r) => r.macAddress === normalized)) {
      return setError('That rover is already paired.');
    }

    const rover = addRover(name, mac);
    // Best-effort, and deliberately not awaited: pairing is a local fact the
    // moment it is written, and a slow database must not hold the sheet open.
    if (supabaseConfigured) void upsertRover(rover);
    toast.success(`${name.trim()} paired`);
    onAdded();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, transition: { duration: 0.16 } }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-sheet border border-line bg-surface p-6 elev-3 sm:rounded-sheet"
      >
        {/* Grab handle — the sheet is bottom-anchored on small screens. */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Pair a rover</h2>
            <p className="mt-1 text-sm text-ink-dim">
              The drive board prints its MAC over serial the moment it joins WiFi.
            </p>
          </div>
          <IconButton icon={<X size={16} />} label="Close" onClick={onClose} className="h-9 w-9 rounded-xl" />
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="North plot"
              autoFocus
            />
          </Field>

          <Field label="MAC address" error={error} hint={error ? undefined : 'Any separator, or none.'}>
            <Input
              mono
              value={mac}
              onChange={(e) => {
                setMac(e.target.value);
                setError(null);
              }}
              placeholder="A4:CF:12:9B:04:E1"
              spellCheck={false}
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Pair rover
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default function Fleet() {
  const [rovers, setRovers] = useState<Rover[]>(() => listRovers());
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const toast = useToast();
  const { rosters, link } = useFleetPresence(rovers);

  const refresh = useCallback(() => setRovers(listRovers()), []);

  /**
   * Reconcile against both stores.
   *
   * The relay's REST list is the phone app's world; Supabase, when configured,
   * is this console's. Neither is authoritative on its own, so the merge is
   * additive by MAC and local pairings are pushed *up* rather than being
   * quietly replaced by whatever the server happened to have.
   */
  const reconcile = useCallback(async (): Promise<Rover[]> => {
    let merged = await syncRovers();

    if (supabaseConfigured) {
      const remote = await fetchRovers();
      const known = new Set(merged.map((r) => r.macAddress));
      for (const r of remote) {
        if (known.has(r.macAddress)) continue;
        saveRover(r);
        merged = [...merged, r];
      }
      // Anything paired here but never written up goes now. Upsert on
      // (owner, MAC) makes this safe to run every time.
      await Promise.all(merged.map((r) => upsertRover(r)));
    }

    return listRovers().length ? listRovers() : merged;
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      setRovers(await reconcile());
      toast.success(
        supabaseConfigured ? 'Fleet synced with the relay and database' : 'Fleet synced with the relay'
      );
    } catch {
      toast.error('Sync failed — the relay may still be waking');
    }
    setSyncing(false);
  }, [toast, reconcile]);

  // Pulled once on arrival so a rover paired on the phone is simply here,
  // rather than requiring somebody to know to press a button.
  useEffect(() => {
    reconcile()
      .then(setRovers)
      .catch(() => {});
  }, [reconcile]);

  const drop = (rover: Rover) => {
    removeRover(rover.id);
    // Cascades to that rover's telemetry and drive sessions by foreign key.
    if (supabaseConfigured) void deleteRover(rover.macAddress);
    refresh();
    toast.info(`${rover.name} removed`);
  };

  const onlineCount = rovers.filter((r) => (rosters[r.macAddress]?.length ?? 0) > 0).length;
  const boardCount = Object.values(rosters).reduce((n, b) => n + b.length, 0);

  return (
    <AppShell>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <AnimatedContent>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Micro className="text-primary-tint">Fleet</Micro>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">
                <SplitText text="Your rovers" />
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={sync} disabled={syncing}>
                <RefreshCw size={16} className={syncing ? 'animate-spin' : undefined} />
                Sync
              </Button>
              <Button onClick={() => setAdding(true)}>
                <Plus size={17} />
                Pair rover
              </Button>
            </div>
          </div>
        </AnimatedContent>

        {/* Summary strip. Derived from what the relay actually reports — no
            invented uptime, no fabricated health score. */}
        <AnimatedContent delay={0.08}>
          <div className="mt-7 grid grid-cols-3 gap-3">
            {[
              { label: 'Paired', value: rovers.length },
              { label: 'Rovers online', value: onlineCount },
              { label: 'Boards on relay', value: boardCount },
            ].map((stat) => (
              <div key={stat.label} className="rounded-card border border-line bg-surface px-4 py-4">
                <Micro>{stat.label}</Micro>
                <p className="mt-1.5 text-3xl font-bold text-ink">
                  <CountUp value={stat.value} />
                </p>
              </div>
            ))}
          </div>
        </AnimatedContent>

        <AnimatedContent delay={0.12}>
          <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
            <PulseDot
              tone={link === 'up' ? 'ok' : link === 'connecting' ? 'accent' : 'bad'}
              size={6}
              halo={link === 'up'}
            />
            {link === 'up'
              ? 'Relay connected'
              : link === 'connecting'
                ? 'Reaching the relay — a cold start takes up to a minute'
                : 'Relay unreachable'}
          </div>
        </AnimatedContent>

        <div className="mt-6">
          {rovers.length === 0 ? (
            <AnimatedContent delay={0.16}>
              <Empty
                icon={<Radio size={26} />}
                title="No rovers paired yet"
                body="Pair the drive board's MAC address and the console will find whatever else is bolted to it — camera, sensor hub, handset."
                action={
                  <Button onClick={() => setAdding(true)}>
                    <Plus size={17} />
                    Pair your first rover
                  </Button>
                }
              />
            </AnimatedContent>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence initial={false}>
                {rovers.map((rover, i) => (
                  <motion.div
                    key={rover.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
                    transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <RoverCard
                      rover={rover}
                      boards={rosters[rover.macAddress]}
                      onRemove={() => drop(rover)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {adding && <AddRoverSheet onClose={() => setAdding(false)} onAdded={refresh} />}
      </AnimatePresence>
    </AppShell>
  );
}
