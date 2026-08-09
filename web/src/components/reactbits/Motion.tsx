import { useRef, useState, useCallback } from 'react';
import { motion, useReducedMotion, useInView } from 'framer-motion';
import { cn } from '../../lib/cn';

/**
 * The React Bits interaction set: AnimatedContent, Magnet, ClickSpark.
 *
 * House rule inherited from the mobile design system — nothing animates without
 * a reason, exits run at 65% of enter, and every loop stops under reduced
 * motion.
 */

/** AnimatedContent — reveal on scroll, once. */
export function AnimatedContent({
  children,
  delay = 0,
  distance = 24,
  direction = 'up',
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();

  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'down' || direction === 'right' ? -1 : 1;
  const offset = distance * sign;

  const from = horizontal ? { opacity: 0, x: offset } : { opacity: 0, y: offset };
  const to = horizontal ? { opacity: 1, x: 0 } : { opacity: 1, y: 0 };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={reduced ? false : from}
      animate={inView || reduced ? to : undefined}
      transition={{ delay, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Magnet — the element leans toward the pointer within a radius.
 *
 * Kept off anything you have to hit accurately. A control that moves away from
 * the cursor is a control you miss, and on this console a missed control is a
 * rover that keeps driving.
 */
export function Magnet({
  children,
  strength = 0.28,
  radius = 90,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  radius?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reduced = useReducedMotion();

  const onMove = (e: React.PointerEvent) => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) > radius + Math.max(r.width, r.height) / 2) return;
    setOffset({ x: dx * strength, y: dy * strength });
  };

  return (
    <motion.div
      ref={ref}
      className={cn('inline-block', className)}
      onPointerMove={onMove}
      onPointerLeave={() => setOffset({ x: 0, y: 0 })}
      animate={offset}
      transition={{ type: 'spring', stiffness: 260, damping: 22, mass: 0.6 }}
    >
      {children}
    </motion.div>
  );
}

interface Spark {
  id: number;
  x: number;
  y: number;
}

/**
 * ClickSpark — a burst of rays at the click point.
 *
 * Confirmation, not decoration: it fires on commands that leave the browser, so
 * a press that produced no spark is a press that produced no command.
 */
export function ClickSpark({
  children,
  color = 'var(--c-accent)',
  count = 8,
  className,
}: {
  children: React.ReactNode;
  color?: string;
  count?: number;
  className?: string;
}) {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const seq = useRef(0);
  const reduced = useReducedMotion();

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduced) return;
      const r = e.currentTarget.getBoundingClientRect();
      const id = seq.current++;
      setSparks((s) => [...s, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
      window.setTimeout(() => setSparks((s) => s.filter((k) => k.id !== id)), 520);
    },
    [reduced]
  );

  return (
    <div className={cn('relative', className)} onClick={onClick}>
      {children}
      {sparks.map((s) => (
        <span
          key={s.id}
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: s.x, top: s.y }}
        >
          {Array.from({ length: count }).map((_, i) => {
            const angle = (360 / count) * i;
            return (
              <motion.span
                key={i}
                className="absolute block h-[2px] w-[7px] rounded-full"
                style={{ background: color, rotate: `${angle}deg` }}
                initial={{ opacity: 0.9, x: 0, y: 0, scaleX: 1 }}
                animate={{
                  opacity: 0,
                  x: Math.cos((angle * Math.PI) / 180) * 20,
                  y: Math.sin((angle * Math.PI) / 180) * 20,
                  scaleX: 0.3,
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            );
          })}
        </span>
      ))}
    </div>
  );
}
