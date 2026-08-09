import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2 } from 'lucide-react';
import type { GamepadStatus as Status } from '../../hooks/useGamepad';
import { Micro } from '../ui/Bits';
import { cn } from '../../lib/cn';

/**
 * Whether a controller is on, and what its buttons do.
 *
 * The disconnected copy says "press any button" rather than "no controller
 * found", because that is literally the situation: browsers withhold a gamepad
 * from the page until the user presses something on it, so a plugged-in pad
 * that has not been touched is invisible and reporting it as absent would send
 * people hunting for a cable fault that isn't there.
 */

/**
 * Both naming families, because the same index is A on Xbox and Cross on
 * PlayStation and showing one label leaves half the users guessing.
 */
const MAPPING: Array<[string, string]> = [
  ['R2 / RT', 'Forward'],
  ['L2 / LT', 'Reverse'],
  ['Left stick', 'Steer'],
  ['D-pad', 'Steer (full)'],
  ['✕ / A', 'Emergency stop'],
  ['◻ / X', 'Emergency stop'],
  ['○ / B', 'Headlight'],
  ['△ / Y', 'Next panel'],
  ['L1 / LB', 'Hold — precision'],
  ['R1 / RB', 'Hold — turbo'],
];

const SPEED_LABEL = {
  precision: 'Precision · 40%',
  normal: 'Normal · 85%',
  turbo: 'Turbo · 100%',
} as const;

export default function GamepadStatus({
  status,
  enabled,
}: {
  status: Status;
  enabled: boolean;
}) {
  if (!enabled) return null;

  return (
    <div
      className={cn(
        'rounded-2xl border px-3.5 py-3 transition-colors duration-300',
        status.connected ? 'border-accent/35 bg-accent-dim' : 'border-line bg-surface'
      )}
    >
      <div className="flex items-center gap-2.5">
        <Gamepad2
          size={16}
          className={status.connected ? 'text-accent-tint' : 'text-ink-muted'}
        />
        <div className="min-w-0 flex-1">
          <Micro className={status.connected ? 'text-accent-tint' : 'text-ink-muted'}>
            {status.connected ? 'Controller' : 'No controller'}
          </Micro>
          <p className="truncate text-xs text-ink-dim">
            {status.connected ? status.id : 'Connect one and press any button'}
          </p>
        </div>

        {/* Deflection meter. Confirms the pad is being read even when the
            rover is unreachable, which separates "controller problem" from
            "link problem" without guessing. */}
        {status.connected && (
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-sunken">
            <motion.div
              className="h-full rounded-full bg-accent-tint"
              animate={{ width: `${Math.round(status.magnitude * 100)}%` }}
              transition={{ duration: 0.08 }}
            />
          </div>
        )}
      </div>

      {/* The speed cap is held, not toggled, so it needs to be visible while
          held — otherwise "why is it slow today" has no answer on screen. */}
      {status.connected && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
              status.speed === 'turbo'
                ? 'border-bad/40 bg-bad-dim text-bad-tint'
                : status.speed === 'precision'
                  ? 'border-primary/40 bg-primary-dim text-primary-tint'
                  : 'border-line bg-sunken text-ink-muted'
            )}
          >
            {SPEED_LABEL[status.speed]}
          </span>
        </div>
      )}

      <AnimatePresence initial={false}>
        {status.connected && (
          <motion.dl
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 overflow-hidden text-[11px]"
          >
            {MAPPING.map(([button, does]) => (
              <div key={button} className="flex items-baseline justify-between gap-2">
                <dt className="tnum shrink-0 text-ink-muted">{button}</dt>
                <dd className="truncate text-ink-dim">{does}</dd>
              </div>
            ))}
          </motion.dl>
        )}
      </AnimatePresence>
    </div>
  );
}
