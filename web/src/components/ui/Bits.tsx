import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/cn';

/** Small shared pieces: PulseDot, Badge, Micro, Field, Divider, Empty. */

/**
 * PulseDot — a live indicator.
 *
 * Colour is never the only signal anywhere in this app, so this always sits
 * beside a word: "Linked", "Offline". On its own it would be a coloured dot
 * that means nothing to anyone who cannot separate the hues.
 */
export function PulseDot({
  tone = 'ok',
  size = 7,
  halo = true,
}: {
  tone?: 'ok' | 'bad' | 'accent' | 'muted';
  size?: number;
  halo?: boolean;
}) {
  const reduced = useReducedMotion();
  const color = {
    ok: 'var(--c-ok-tint)',
    bad: 'var(--c-bad-tint)',
    accent: 'var(--c-accent-tint)',
    muted: 'var(--c-ink-muted)',
  }[tone];

  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {halo && !reduced && tone !== 'muted' && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: color }}
          // Ping-pong repeat. The nested withDelay/withSequence form stalls
          // after one leg; this is the shape that keeps running.
          animate={{ scale: [1, 2.4, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span className="relative h-full w-full rounded-full" style={{ background: color }} />
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'bad' | 'accent' | 'primary';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-raised text-ink-dim border-line',
    ok: 'bg-ok-dim text-ok-tint border-ok/25',
    bad: 'bg-bad-dim text-bad-tint border-bad/25',
    accent: 'bg-accent-dim text-accent-tint border-accent/25',
    primary: 'bg-primary-dim text-primary-tint border-primary/25',
  }[tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        tones,
        className
      )}
    >
      {children}
    </span>
  );
}

/** The one micro-label style: 10px / 600 / 1.4 tracking, uppercase. */
export function Micro({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('micro text-ink-muted', className)}>{children}</span>;
}

/**
 * Field — label above the input, never a floating placeholder.
 *
 * A placeholder that becomes the label leaves the field unlabelled the moment
 * you start typing, which is exactly when you most want to check what it wants.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="micro mb-2 block text-ink-dim">{label}</span>
      {children}
      <AnimatePresence mode="wait">
        {(error || hint) && (
          <motion.span
            key={error ?? hint}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn('mt-2 block text-xs', error ? 'text-bad-tint' : 'text-ink-muted')}
          >
            {error ?? hint}
          </motion.span>
        )}
      </AnimatePresence>
    </label>
  );
}

export function Input({
  className,
  mono,
  ...rest
}: { mono?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-2xl border border-line bg-sunken px-4 py-3 text-sm text-ink',
        'placeholder:text-ink-muted transition-colors duration-200',
        'hover:border-line-strong focus:border-primary-tint focus:outline-none',
        mono && 'tnum tracking-wide',
        className
      )}
      {...rest}
    />
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />;
}

/** Empty states carry an illustration-ish mark and exactly one action. */
export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-line bg-surface/50 px-8 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-primary-dim text-primary-tint">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-ink-dim">{body}</p>
      </div>
      {action}
    </div>
  );
}
