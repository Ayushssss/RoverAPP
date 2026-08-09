import { lazy, Suspense, useMemo, useState, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { RoverMark } from '../AppShell';

/**
 * The 3D rover, behind a capability gate.
 *
 * Everything expensive lives in `RoverScene` and is reached through this lazy
 * boundary, so three.js is fetched only once a scene is actually going to
 * render. The checks below are deliberately cheap and synchronous — they decide
 * whether to download the engine at all, and they cannot be the reason the page
 * is slow.
 *
 * Three ways to end up with the flat mark instead:
 *   • no WebGL — a locked-down browser, a blocklisted GPU, a headless run
 *   • reduced motion — the model's whole point is that it moves
 *   • the scene module failed to load — an offline reload, a bad deploy
 */

const RoverScene = lazy(() => import('./RoverScene'));

export interface Rover3DProps {
  mode?: 'showcase' | 'attitude';
  /** Live stick vector. Read through a ref so 25Hz updates never re-render. */
  heading?: React.RefObject<{ x: number; y: number }>;
  lightOn?: boolean;
  className?: string;
  height?: number;
}

function Fallback({ className, height }: { className?: string; height: number }) {
  return (
    <div className={className} style={{ height }} role="img" aria-label="AgriVerse rover">
      <div className="flex h-full w-full items-center justify-center">
        <RoverMark size={Math.min(height * 0.5, 140)} />
      </div>
    </div>
  );
}

export default function Rover3D({ className, height = 320, ...scene }: Rover3DProps) {
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);

  const supported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }, []);

  // A chunk that fails to load rejects a promise React re-throws on render;
  // without catching it here the whole page would go down over a decoration.
  useEffect(() => {
    if (!supported || reduced) return;
    import('./RoverScene').catch(() => setFailed(true));
  }, [supported, reduced]);

  if (!supported || reduced || failed) return <Fallback className={className} height={height} />;

  return (
    <Suspense fallback={<Fallback className={className} height={height} />}>
      <RoverScene className={className} height={height} {...scene} />
    </Suspense>
  );
}
