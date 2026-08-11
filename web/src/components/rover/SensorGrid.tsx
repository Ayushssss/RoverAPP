import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Thermometer,
  Droplets,
  Flame,
  Sprout,
  Sun,
  Gauge,
  Ruler,
  OctagonAlert,
  Lightbulb,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { SENSOR_META } from '../../lib/config';
import { CountUp } from '../reactbits/Text';
import { Micro } from '../ui/Bits';
import SpotlightCard from '../reactbits/SpotlightCard';

const ICONS: Record<string, LucideIcon> = {
  thermometer: Thermometer,
  droplets: Droplets,
  flame: Flame,
  sprout: Sprout,
  sun: Sun,
  gauge: Gauge,
  ruler: Ruler,
  'octagon-alert': OctagonAlert,
  lightbulb: Lightbulb,
};

const HISTORY = 40;

/**
 * A single reading, with the last 40 samples behind it.
 *
 * The sparkline is scaled to the range actually observed rather than to a fixed
 * span: a soil probe that has drifted 3% all afternoon should look like it
 * drifted, not like a flat line.
 */
function SensorCard({ name, value }: { name: string; value: number }) {
  const meta = SENSOR_META[name];
  const Icon = meta ? (ICONS[meta.icon] ?? Activity) : Activity;
  const history = useRef<number[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    history.current = [...history.current, value].slice(-HISTORY);
    force((n) => n + 1);
  }, [value]);

  const points = history.current;
  let path = '';
  if (points.length > 1) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    path = points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * 100;
        const y = 22 - ((p - min) / span) * 18;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  return (
    <SpotlightCard className="p-4" radius={200}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-dim text-primary-tint">
          <Icon size={17} strokeWidth={2} />
        </div>
        {points.length > 1 && (
          <svg viewBox="0 0 100 24" className="h-6 w-20 overflow-visible" aria-hidden>
            <path
              d={path}
              fill="none"
              stroke="var(--c-primary-tint)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.7}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>

      <div className="mt-4">
        <Micro>{meta?.label ?? name}</Micro>
        <div className="mt-1 flex items-baseline gap-1">
          {/* `live` shortens the ease to 300ms — a reading that takes a second
              to reach the truth is one you can't trust while driving. */}
          <CountUp
            value={value}
            digits={meta?.digits ?? 2}
            live
            className="text-2xl font-bold text-ink"
          />
          {meta?.unit && <span className="text-sm text-ink-dim">{meta.unit}</span>}
        </div>
      </div>
    </SpotlightCard>
  );
}

export default function SensorGrid({
  readings,
  hasHub,
}: {
  readings: Record<string, number>;
  hasHub: boolean;
}) {
  const keys = Object.keys(readings);

  if (keys.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line px-6 py-10 text-center">
        <p className="text-sm text-ink-dim">
          {hasHub
            ? 'Sensor hub online — waiting for readings'
            : 'No sensor hub on this rover'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <AnimatePresence initial={false}>
        {keys.map((name, i) => (
          <motion.div
            key={name}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}
            // 40ms stagger, capped at 8 steps so a hub that suddenly reports
            // twelve values doesn't queue up half a second of waiting.
            transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <SensorCard name={name} value={readings[name]} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
