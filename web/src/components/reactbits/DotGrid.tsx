import { useEffect, useRef } from 'react';

/**
 * DotGrid — a React Bits pattern, retuned as this console's blueprint backdrop.
 *
 * The mobile app draws its grid as one repeating SVG pattern with a radial
 * vignette; the same idea here, on a canvas, so the dots can react to the
 * pointer. That fade at the edges is what makes it read as an infinite work
 * surface rather than a bounded sheet.
 *
 * One canvas, one rAF loop, and the loop parks itself when the pointer is away
 * and everything has settled — a decorative background has no business holding
 * a frame budget while you are reading telemetry.
 */
export default function DotGrid({
  gap = 26,
  dotSize = 1.4,
  influence = 130,
  className = '',
}: {
  gap?: number;
  dotSize?: number;
  /** Pointer radius, in px, over which dots brighten and lift. */
  influence?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ink = getComputedStyle(document.documentElement)
      .getPropertyValue('--c-ink-rgb')
      .trim() || '255, 247, 237';
    const tint = getComputedStyle(document.documentElement)
      .getPropertyValue('--c-primary-tint')
      .trim() || '#e8825a';

    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pointer = { x: -9999, y: -9999, active: false };
    let raf = 0;
    let settleFrames = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      // The vignette radius is the half-diagonal, so the fade always reaches
      // the corners regardless of aspect ratio.
      const maxR = Math.hypot(cx, cy);

      for (let y = gap; y < h; y += gap) {
        for (let x = gap; x < w; x += gap) {
          // Dots dissolve toward the edges — this is the whole trick.
          const edge = 1 - Math.min(Math.hypot(x - cx, y - cy) / maxR, 1);
          const base = 0.05 + edge * 0.11;

          let alpha = base;
          let r = dotSize;
          let useTint = false;

          if (pointer.active) {
            const d = Math.hypot(x - pointer.x, y - pointer.y);
            if (d < influence) {
              const near = 1 - d / influence;
              const eased = near * near;
              alpha = base + eased * 0.55;
              r = dotSize + eased * 1.9;
              useTint = eased > 0.35;
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = useTint ? tint : `rgba(${ink}, ${alpha})`;
          ctx.globalAlpha = useTint ? alpha : 1;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    };

    const loop = () => {
      draw();
      // Two idle frames after the pointer leaves, then stop. Re-armed by the
      // next pointer event.
      if (!pointer.active) {
        settleFrames += 1;
        if (settleFrames > 2) {
          raf = 0;
          return;
        }
      } else {
        settleFrames = 0;
      }
      raf = requestAnimationFrame(loop);
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      if (reduced) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
      kick();
    };

    const onLeave = () => {
      pointer.active = false;
      kick();
    };

    resize();
    draw();

    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);

    return () => {
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [gap, dotSize, influence]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
