import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/cn';

/**
 * Button — 21st.dev's variant/size shape, wearing this console's roles.
 *
 * `primary` is a fill and carries `primary-on` text; `primary-tint` is the same
 * hue used as *text* on the canvas. Using the fill colour as text is what makes
 * accent copy unreadable, so the two are never interchangeable.
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-on hover:bg-primary-pressed border-transparent shadow-[0_8px_24px_-12px_var(--c-primary)]',
  secondary: 'bg-raised text-ink border-line hover:border-line-strong hover:bg-surface',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-raised hover:text-ink',
  danger: 'bg-bad-dim text-bad-tint border-bad/40 hover:bg-bad hover:text-white',
  accent: 'bg-accent-dim text-accent-tint border-accent/30 hover:bg-accent/25',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-sm gap-2 rounded-2xl',
  lg: 'h-13 px-7 text-[15px] gap-2.5 rounded-2xl',
};

/*
  Props come from `HTMLMotionProps` rather than `ButtonHTMLAttributes`: the two
  disagree about `onDrag`, `onAnimationStart` and the rest of the pointer set,
  and spreading plain DOM attributes onto a motion element is what makes those
  collide.
*/
export interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: Variant;
  size?: Size;
  /** Icon-only buttons must name themselves — enforced here, not by review. */
  label?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, children, label, ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      // 3% and interruptible, matching the mobile press feedback.
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      aria-label={label}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center border font-semibold no-select',
        'transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

export default Button;

/** Square icon button. 44px minimum, always labelled. */
export function IconButton({
  icon,
  label,
  active,
  tone = 'default',
  className,
  ...rest
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  tone?: 'default' | 'accent' | 'danger';
} & HTMLMotionProps<'button'>) {
  const activeTone =
    tone === 'accent'
      ? 'bg-accent-dim border-accent/40 text-accent-tint'
      : tone === 'danger'
        ? 'bg-bad-dim border-bad/40 text-bad-tint'
        : 'bg-primary-dim border-primary/40 text-primary-tint';

  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border',
        'transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        active ? activeTone : 'border-line bg-raised text-ink-2 hover:border-line-strong hover:text-ink',
        className
      )}
      {...rest}
    >
      {icon}
    </motion.button>
  );
}
