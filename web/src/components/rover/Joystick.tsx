import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * The drive stick.
 *
 * Pointer events rather than mouse/touch pairs, so a pen, a finger and a mouse
 * all take the same path, and `setPointerCapture` keeps the drag alive when the
 * cursor leaves the ring mid-throw — without it, a fast flick outside the
 * bounds strands the rover at full deflection.
 *
 * Emission is throttled to 25Hz to match the phone. The rover's failsafe cuts
 * motors after 1s of silence, so the parent re-sends the held vector every
 * 250ms; this component only reports change.
 */

const DEAD_ZONE = 0.06;
const EMIT_MS = 40;

export default function Joystick({
  size = 280,
  disabled = false,
  onMove,
  onRelease,
  /** Vector to display when something else is steering (a tilt controller). */
  external,
}: {
  size?: number;
  disabled?: boolean;
  onMove: (x: number, y: number) => void;
  onRelease: () => void;
  external?: { x: number; y: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [grabbed, setGrabbed] = useState(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const lastEmit = useRef(0);
  const reduced = useReducedMotion();

  const radius = size / 2;
  const knobSize = Math.round(size * 0.3);
  const limit = radius - knobSize / 2 - 6;

  // While a physical controller drives, mirror it instead of sitting at centre.
  useEffect(() => {
    if (grabbed || !external) return;
    setKnob({ x: external.x * limit, y: -external.y * limit });
  }, [external, grabbed, limit]);

  const project = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      let dx = clientX - (r.left + r.width / 2);
      let dy = clientY - (r.top + r.height / 2);

      const dist = Math.hypot(dx, dy);
      if (dist > limit) {
        dx = (dx / dist) * limit;
        dy = (dy / dist) * limit;
      }
      return { x: dx, y: dy };
    },
    [limit]
  );

  const emit = useCallback(
    (px: number, py: number, force = false) => {
      const now = performance.now();
      if (!force && now - lastEmit.current < EMIT_MS) return;
      lastEmit.current = now;

      // Screen y grows downward; the rover's forward is +y. Flipping here means
      // no consumer downstream has to remember to.
      let x = px / limit;
      let y = -py / limit;
      // A 6% dead zone. Below it, a resting hand on a stick that has drifted a
      // pixel is indistinguishable from a deliberate crawl.
      if (Math.hypot(x, y) < DEAD_ZONE) {
        x = 0;
        y = 0;
      }
      onMove(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
    },
    [limit, onMove]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setGrabbed(true);
    const p = project(e.clientX, e.clientY);
    setKnob(p);
    emit(p.x, p.y, true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!grabbed) return;
    const p = project(e.clientX, e.clientY);
    setKnob(p);
    emit(p.x, p.y);
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!grabbed) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setGrabbed(false);
    setKnob({ x: 0, y: 0 });
    onRelease();
  };

  const deflection = Math.min(Math.hypot(knob.x, knob.y) / limit, 1);
  const live = deflection > DEAD_ZONE;

  return (
    <div
      ref={ref}
      role="application"
      aria-label="Drive stick — drag to steer"
      aria-disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      className="no-select relative touch-none"
      style={{ width: size, height: size, cursor: disabled ? 'not-allowed' : grabbed ? 'grabbing' : 'grab' }}
    >
      {/* Ring */}
      <div
        className="absolute inset-0 rounded-full border border-line bg-sunken transition-colors duration-300"
        style={{
          borderColor: live ? 'var(--c-primary)' : undefined,
          boxShadow: live
            ? `0 0 0 1px color-mix(in srgb, var(--c-primary) 30%, transparent), inset 0 0 60px -20px var(--c-primary)`
            : 'inset 0 2px 20px -8px rgb(0 0 0 / 0.6)',
        }}
      />

      {/* Crosshair + travel rings, the instrument face. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle cx={radius} cy={radius} r={limit} fill="none" stroke="var(--c-line)" strokeDasharray="2 6" />
        <circle
          cx={radius}
          cy={radius}
          r={limit * DEAD_ZONE * 4}
          fill="none"
          stroke="var(--c-line)"
          strokeDasharray="1 4"
        />
        <line x1={radius} y1={radius - limit} x2={radius} y2={radius - limit + 12} stroke="var(--c-line-strong)" />
        <line x1={radius} y1={radius + limit} x2={radius} y2={radius + limit - 12} stroke="var(--c-line-strong)" />
        <line x1={radius - limit} y1={radius} x2={radius - limit + 12} y2={radius} stroke="var(--c-line-strong)" />
        <line x1={radius + limit} y1={radius} x2={radius + limit - 12} y2={radius} stroke="var(--c-line-strong)" />

        {/* The vector itself, drawn from centre to knob. */}
        {live && (
          <line
            x1={radius}
            y1={radius}
            x2={radius + knob.x}
            y2={radius + knob.y}
            stroke="var(--c-primary-tint)"
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.55}
          />
        )}
      </svg>

      {/* Knob */}
      <motion.div
        className="absolute rounded-full border no-select"
        style={{
          width: knobSize,
          height: knobSize,
          left: radius - knobSize / 2,
          top: radius - knobSize / 2,
          background: live
            ? 'linear-gradient(160deg, var(--c-primary-tint), var(--c-primary))'
            : 'linear-gradient(160deg, var(--c-raised), var(--c-surface))',
          borderColor: live ? 'transparent' : 'var(--c-line-strong)',
          boxShadow: live
            ? '0 10px 30px -8px var(--c-primary), inset 0 1px 0 rgb(255 255 255 / 0.25)'
            : '0 8px 22px -10px rgb(0 0 0 / 0.9), inset 0 1px 0 rgb(255 255 255 / 0.08)',
        }}
        animate={{
          x: knob.x,
          y: knob.y,
          // Idle breath, stopped the moment the stick is grabbed — a control
          // that keeps breathing under your finger reads as unresponsive.
          scale: grabbed ? 1.06 : reduced || live ? 1 : [1, 1.035, 1],
        }}
        transition={{
          x: grabbed ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 420, damping: 30 },
          y: grabbed ? { type: 'tween', duration: 0 } : { type: 'spring', stiffness: 420, damping: 30 },
          scale: grabbed || live ? { duration: 0.18 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' },
        }}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="h-1.5 w-1.5 rounded-full transition-colors"
            style={{ background: live ? 'var(--c-primary-on)' : 'var(--c-ink-muted)' }}
          />
        </div>
      </motion.div>
    </div>
  );
}
