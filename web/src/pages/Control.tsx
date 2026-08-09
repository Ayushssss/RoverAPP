import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Lightbulb,
  LightbulbOff,
  OctagonX,
  Keyboard,
  Gamepad2,
  Thermometer,
  Cpu,
  MonitorSmartphone,
  History,
  type LucideIcon,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import Joystick from '../components/rover/Joystick';
import DPad from '../components/rover/DPad';
import CameraView from '../components/rover/CameraView';
import SensorGrid from '../components/rover/SensorGrid';
import BoardRoster from '../components/rover/BoardRoster';
import DisplayComposer from '../components/rover/DisplayComposer';
import HistoryPanel from '../components/rover/HistoryPanel';
import GamepadStatus from '../components/rover/GamepadStatus';
import Rover3D from '../components/three/Rover3D';
import { useGamepad, type GamepadAction } from '../hooks/useGamepad';
import { AnimatedContent, ClickSpark } from '../components/reactbits/Motion';
import { DecryptedText } from '../components/reactbits/Text';
import Button, { IconButton } from '../components/ui/Button';
import { Badge, Micro, PulseDot } from '../components/ui/Bits';
import { useToast } from '../components/ui/Toast';
import { useRoverLink } from '../hooks/useRoverLink';
import { getRover } from '../lib/store';
import { cn } from '../lib/cn';

type Tab = 'sensors' | 'history' | 'boards' | 'panel';

const TABS: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'sensors', label: 'Sensors', icon: Thermometer },
  { id: 'history', label: 'History', icon: History },
  { id: 'boards', label: 'Boards', icon: Cpu },
  { id: 'panel', label: 'Panel', icon: MonitorSmartphone },
];

/** A single mono readout. Tabular figures, so a changing value can't jitter. */
function Readout({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="min-w-[68px] text-center">
      <Micro>{label}</Micro>
      <p
        className={cn(
          'tnum mt-1 text-[15px]',
          tone === 'ok' ? 'text-ok-tint' : tone === 'bad' ? 'text-bad-tint' : 'text-ink'
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default function Control() {
  const { id } = useParams<{ id: string }>();
  const rover = useMemo(() => (id ? getRover(id) : undefined), [id]);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('sensors');
  const [keyboardOn, setKeyboardOn] = useState(true);
  const [padOn, setPadOn] = useState(true);

  const link = useRoverLink(rover ?? null);

  useEffect(() => {
    if (!rover) return;
    return link.bindKeyboard(keyboardOn);
  }, [rover, keyboardOn, link.bindKeyboard]);

  /*
    Controller input goes down the same path as the touch stick, so the rover
    cannot tell which one is steering — and neither can the rest of this page.
    A dropped vector is deliberately silent: at 25Hz a toast per frame would
    bury the screen, and the Link readout already says DOWN.
  */
  const onPadVector = useCallback(
    (x: number, y: number) => {
      link.drive(x, y);
    },
    [link.drive]
  );

  const onPadAction = useCallback(
    (action: GamepadAction) => {
      if (action === 'stop') {
        if (!link.stop()) toast.error('Not linked — the stop was not sent');
      } else if (action === 'light') {
        if (!link.toggleLight()) toast.error('Not linked — the command was not sent');
      } else {
        setTab((current) => {
          const order = TABS.map((t) => t.id);
          return order[(order.indexOf(current) + 1) % order.length];
        });
      }
    },
    [link.stop, link.toggleLight, toast]
  );

  const pad = useGamepad({
    enabled: padOn && !!rover,
    onVector: onPadVector,
    onAction: onPadAction,
    // Feeds the disconnection alert: whoever is holding the pad is watching the
    // rover, not this screen, so a dropped relay has to be felt.
    linkUp: link.connected,
  });

  if (!rover) return <Navigate to="/fleet" replace />;

  const notLinked = () => toast.error('Not linked — the command was not sent');

  const onStart = (dir: Parameters<typeof link.startDirection>[0]) => {
    if (!link.startDirection(dir)) notLinked();
  };

  const onStop = () => {
    if (!link.stop()) notLinked();
  };

  const onLight = () => {
    if (!link.toggleLight()) notLinked();
  };

  return (
    <AppShell wide>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        {/* ── header ── */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-5">
          <Link to="/fleet">
            <IconButton icon={<ArrowLeft size={17} />} label="Back to fleet" />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">{rover.name}</h1>
            <div className="mt-0.5 flex items-center gap-1.5">
              <PulseDot
                tone={link.connected ? 'ok' : link.link === 'connecting' ? 'accent' : 'bad'}
                size={5}
                halo={link.connected}
              />
              <span className={cn('text-xs', link.connected ? 'text-ink-dim' : 'text-bad-tint')}>
                {link.connected
                  ? link.roverIp
                    ? 'Linked'
                    : 'Linked · no board address yet'
                  : link.link === 'connecting'
                    ? 'Reconnecting…'
                    : 'Relay unreachable'}
              </span>
              {link.roverIp && (
                <DecryptedText text={link.roverIp} className="tnum text-xs text-ink-muted" />
              )}
            </div>
          </div>

          {link.hasController && (
            <Badge tone="accent">
              <Gamepad2 size={12} />
              Handset paired
            </Badge>
          )}

          <IconButton
            icon={<Gamepad2 size={17} className={padOn ? undefined : 'opacity-50'} />}
            label={padOn ? 'Disable controller' : 'Enable controller'}
            tone="accent"
            active={padOn && pad.connected}
            onClick={() => setPadOn((v) => !v)}
          />
          <IconButton
            icon={keyboardOn ? <Keyboard size={17} /> : <Keyboard size={17} className="opacity-50" />}
            label={keyboardOn ? 'Disable keyboard drive' : 'Enable keyboard drive'}
            active={keyboardOn}
            onClick={() => setKeyboardOn((v) => !v)}
          />
          <IconButton
            icon={link.lightOn ? <Lightbulb size={17} /> : <LightbulbOff size={17} />}
            label="Toggle headlight"
            tone="accent"
            active={link.lightOn}
            onClick={onLight}
          />
        </div>

        {/* ── body ── */}
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(380px,460px)_1fr]">
          {/* Drive column */}
          <AnimatedContent>
            <div className="space-y-5 rounded-card border border-line bg-surface/60 p-6">
              {/* Attitude rig. Fed from the heading *ref*, so the 25Hz stick
                  stream drives the model without re-rendering this page. It
                  shows the commanded vector, not a measured one — the rover
                  carries no IMU, and drawing one would be inventing data. */}
              <div className="relative overflow-hidden rounded-2xl border border-line bg-sunken">
                <div className="pointer-events-none absolute left-3 top-3 z-10">
                  <Micro>Commanded attitude</Micro>
                </div>
                <Rover3D
                  mode="attitude"
                  heading={link.headingRef}
                  lightOn={link.lightOn}
                  height={200}
                />
              </div>

              <div className="flex justify-center">
                <Joystick
                  size={300}
                  disabled={!link.connected}
                  external={link.external}
                  onMove={(x, y) => link.drive(x, y)}
                  onRelease={onStop}
                />
              </div>

              <div className="flex items-center justify-center gap-4 rounded-2xl border border-line bg-surface px-5 py-3">
                <Readout label="X" value={link.coords.x.toFixed(2)} />
                <div className="h-8 w-px bg-line" />
                <Readout label="Y" value={link.coords.y.toFixed(2)} />
                <div className="h-8 w-px bg-line" />
                <Readout
                  label="Link"
                  value={link.connected ? 'UP' : 'DOWN'}
                  tone={link.connected ? 'ok' : 'bad'}
                />
              </div>

              <div className="flex justify-center pt-1">
                <DPad
                  held={link.held}
                  onStart={onStart}
                  onEnd={link.endDirection}
                  onStop={onStop}
                />
              </div>

              {/* The spark is confirmation, not decoration: a press that
                  produced no spark produced no command. */}
              <ClickSpark color="var(--c-bad-tint)">
                <Button variant="danger" size="lg" className="w-full" onClick={onStop}>
                  <OctagonX size={18} />
                  Emergency stop
                </Button>
              </ClickSpark>

              <GamepadStatus status={pad} enabled={padOn} />

              <p className="text-center text-[11px] text-ink-muted">
                {keyboardOn ? (
                  <>
                    <span className="tnum">W A S D</span> to steer ·{' '}
                    <span className="tnum">SPACE</span> to stop
                  </>
                ) : (
                  'Keyboard drive is off'
                )}
              </p>
            </div>
          </AnimatedContent>

          {/* Telemetry column */}
          <div className="space-y-6">
            <AnimatedContent delay={0.08}>
              <CameraView mac={rover.macAddress} available={link.camera.available} />
            </AnimatedContent>

            <AnimatedContent delay={0.14}>
              <div className="rounded-card border border-line bg-surface/60 p-5">
                {/* Segmented control. The indicator is a shared layout element,
                    so it slides between tabs instead of cross-fading. */}
                <div className="flex gap-1 rounded-2xl border border-line bg-sunken p-1">
                  {TABS.map((t) => {
                    const Icon = t.icon;
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        aria-pressed={active}
                        className={cn(
                          'relative flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-200',
                          active ? 'text-primary-tint' : 'text-ink-dim hover:text-ink'
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="tab-indicator"
                            className="absolute inset-0 rounded-xl border border-primary/30 bg-primary-dim"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          />
                        )}
                        <span className="relative flex items-center gap-2">
                          <Icon size={15} />
                          {t.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tab}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.13 } }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {tab === 'sensors' && (
                        <SensorGrid readings={link.readings} hasHub={link.hasSensorHub} />
                      )}
                      {tab === 'history' && <HistoryPanel mac={rover.macAddress} />}
                      {tab === 'boards' && <BoardRoster boards={link.boards} />}
                      {tab === 'panel' && (
                        <DisplayComposer mac={rover.macAddress} disabled={!link.connected} />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </AnimatedContent>
          </div>
        </div>
      </motion.div>
    </AppShell>
  );
}
