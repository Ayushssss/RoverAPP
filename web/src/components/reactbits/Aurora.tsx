import { motion, useReducedMotion } from 'framer-motion';

/**
 * Aurora — React Bits' drifting colour field, kept honest.
 *
 * Three heavily-blurred radial washes on a very long, offset loop. The offsets
 * matter: give them the same period and the whole field pulses in time, which
 * reads as a broken loading state rather than as light.
 *
 * Palette comes from the live scheme's roles, so this drifts terracotta or
 * indigo without knowing which.
 */
export default function Aurora({ intensity = 1 }: { intensity?: number }) {
  const reduced = useReducedMotion();

  const blobs = [
    {
      color: 'var(--c-primary)',
      className: 'left-[-10%] top-[-18%] h-[46rem] w-[46rem]',
      opacity: 0.3 * intensity,
      duration: 26,
      drift: { x: [0, 70, -30, 0], y: [0, -50, 40, 0] },
    },
    {
      color: 'var(--c-accent)',
      className: 'right-[-14%] top-[6%] h-[38rem] w-[38rem]',
      opacity: 0.18 * intensity,
      duration: 34,
      drift: { x: [0, -60, 40, 0], y: [0, 60, -20, 0] },
    },
    {
      color: 'var(--c-primary-tint)',
      className: 'left-[24%] bottom-[-28%] h-[42rem] w-[42rem]',
      opacity: 0.2 * intensity,
      duration: 30,
      drift: { x: [0, 40, -60, 0], y: [0, -30, 20, 0] },
    },
  ];

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-[110px] ${b.className}`}
          style={{ background: b.color, opacity: b.opacity }}
          animate={reduced ? undefined : b.drift}
          transition={{ duration: b.duration, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      {/* Sinks the whole field toward the canvas colour so content above it
          keeps its contrast ratio. */}
      <div className="absolute inset-0 bg-linear-to-b from-bg/40 via-bg/70 to-bg" />
    </div>
  );
}
