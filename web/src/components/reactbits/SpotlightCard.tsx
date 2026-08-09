import { useRef, useState } from 'react';
import { cn } from '../../lib/cn';

/**
 * SpotlightCard — React Bits' cursor-following highlight.
 *
 * The spotlight is driven through CSS custom properties rather than React
 * state, so pointer movement never re-renders the card's children. On a fleet
 * grid that difference is the whole reason it is usable.
 *
 * The card is opaque, not glass: glass over a flat panel is a tinted rectangle.
 * Glass is reserved for surfaces that actually sit over content.
 */
export default function SpotlightCard({
  children,
  className,
  spotlightColor = 'var(--c-primary-tint)',
  radius = 320,
  as: Tag = 'div',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  radius?: number;
  as?: 'div' | 'article' | 'section';
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <Tag
      ref={ref as never}
      onPointerMove={onMove}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      className={cn(
        'group relative overflow-hidden rounded-card border border-line bg-surface',
        'transition-colors duration-300 hover:border-line-strong',
        className
      )}
      {...rest}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: lit ? 1 : 0,
          background: `radial-gradient(${radius}px circle at var(--mx, 50%) var(--my, 0px), color-mix(in srgb, ${spotlightColor} 14%, transparent), transparent 70%)`,
        }}
      />
      <div className="relative">{children}</div>
    </Tag>
  );
}
