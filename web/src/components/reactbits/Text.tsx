import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useInView } from 'framer-motion';
import { cn } from '../../lib/cn';

/**
 * The React Bits text set: SplitText, ShinyText, DecryptedText, CountUp.
 *
 * All four honour reduced motion by landing on their final state immediately —
 * a headline that never resolves is worse than one that never animated.
 */

/** SplitText — per-word entrance with a capped stagger. */
export function SplitText({
  text,
  className,
  delay = 0,
  stagger = 0.045,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduced = useReducedMotion();
  const words = text.split(' ');

  // Always a span, so this composes inside whatever heading the page chose.
  // Owning the tag would mean every caller re-declaring its own type scale.
  if (reduced) return <span className={className}>{text}</span>;

  return (
    <span className={cn('inline-block', className)} aria-label={text}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{
              // Capped so a long line doesn't queue up a visible wait at the
              // end — past ~10 steps the tail just looks late.
              delay: delay + Math.min(i, 10) * stagger,
              duration: 0.62,
              ease: [0.16, 1, 0.3, 1],
            }}
            aria-hidden
          >
            {word}
          </motion.span>
          {i < words.length - 1 && <span aria-hidden>&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}

/** ShinyText — a specular sweep across the glyphs. Reserved for live labels. */
export function ShinyText({
  children,
  className,
  speed = 4,
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <span
      className={cn('relative inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage: reduced
          ? 'linear-gradient(90deg, var(--c-ink-2), var(--c-ink-2))'
          : 'linear-gradient(110deg, var(--c-ink-dim) 35%, var(--c-ink) 50%, var(--c-ink-dim) 65%)',
        backgroundSize: '250% 100%',
        animation: reduced ? undefined : `shine ${speed}s linear infinite`,
      }}
    >
      {children}
      <style>{`@keyframes shine { 0% { background-position: 150% 0 } 100% { background-position: -50% 0 } }`}</style>
    </span>
  );
}

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/\\<>[]{}*#%$@';

/**
 * DecryptedText — scrambles, then resolves left to right.
 *
 * Used for MAC addresses and IPs, where the scramble is thematically the right
 * gag: it is literally the machine identity settling.
 */
export function DecryptedText({
  text,
  className,
  speed = 34,
  startOnView = true,
}: {
  text: string;
  className?: string;
  speed?: number;
  startOnView?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [shown, setShown] = useState(reduced ? text : '');

  useEffect(() => {
    if (reduced) {
      setShown(text);
      return;
    }
    if (startOnView && !inView) return;

    let frame = 0;
    const total = text.length;
    const id = setInterval(() => {
      frame += 1;
      // Resolve one character every other tick, scrambling the rest — a
      // straight per-character reveal reads as a typewriter, not a decrypt.
      const settled = Math.floor(frame / 2);
      if (settled >= total) {
        setShown(text);
        clearInterval(id);
        return;
      }
      const scrambled = text
        .slice(settled)
        .split('')
        .map((c) => (c === ' ' || c === ':' || c === '.' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
        .join('');
      setShown(text.slice(0, settled) + scrambled);
    }, speed);

    return () => clearInterval(id);
  }, [text, speed, inView, startOnView, reduced]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden>{shown || text.replace(/./g, ' ')}</span>
    </span>
  );
}

/**
 * CountUp — eases a number toward its target.
 *
 * Live telemetry passes `live`, which shortens the ease to 300ms: a reading
 * that takes a second to arrive at the truth is a reading you cannot trust
 * while driving.
 */
export function CountUp({
  value,
  digits = 0,
  className,
  live = false,
  suffix = '',
}: {
  value: number;
  digits?: number;
  className?: string;
  live?: boolean;
  suffix?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const span = value - origin;
    const ms = live ? 300 : 900;

    if (Math.abs(span) < 1e-9) return;

    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + span * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, live, reduced]);

  useEffect(() => {
    from.current = shown;
  }, [shown]);

  return (
    <span className={cn('tnum', className)}>
      {shown.toFixed(digits)}
      {suffix}
    </span>
  );
}
