import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import { Micro } from '../components/ui/Bits';
import { useGamepad, type GamepadAction } from '../hooks/useGamepad';
import { cn } from '../lib/cn';

/**
 * Raw controller readout.
 *
 * Deliberately unguarded and dependency-free — no relay, no account, no rover.
 * When somebody reports "the controller does nothing", the first thing worth
 * knowing is whether the browser can see the pad at all and which axes it is
 * actually using, and neither of those should require signing in to find out.
 *
 * Plenty of pads report `mapping: ""` rather than `"standard"` and shuffle the
 * axis order; this page is how you find that out instead of guessing.
 */
export default function GamepadDiagnostics() {
  const [snapshot, setSnapshot] = useState<{
    supported: boolean;
    pads: Array<{
      index: number;
      id: string;
      mapping: string;
      axes: number[];
      buttons: number[];
    }>;
  }>({ supported: true, pads: [] });

  const raf = useRef(0);

  /*
    The same hook the control page uses, reporting what it would actually send.
    Raw axes above prove the browser sees the pad; this proves the mapping and
    the emit path work — which are different failures with different fixes.
  */
  const [emitted, setEmitted] = useState({ x: 0, y: 0, count: 0 });
  const [actions, setActions] = useState<string[]>([]);

  const onVector = useCallback((x: number, y: number) => {
    setEmitted((prev) => ({ x, y, count: prev.count + 1 }));
  }, []);

  const onAction = useCallback((action: GamepadAction) => {
    setActions((prev) => [`${new Date().toLocaleTimeString()} · ${action}`, ...prev].slice(0, 6));
  }, []);

  const status = useGamepad({ enabled: true, onVector, onAction });

  useEffect(() => {
    if (typeof navigator.getGamepads !== 'function') {
      setSnapshot({ supported: false, pads: [] });
      return;
    }

    const tick = () => {
      raf.current = requestAnimationFrame(tick);
      const pads: typeof snapshot.pads = [];
      for (const pad of navigator.getGamepads()) {
        if (!pad) continue;
        pads.push({
          index: pad.index,
          id: pad.id,
          mapping: pad.mapping || '(none)',
          axes: [...pad.axes].map((a) => Math.round(a * 100) / 100),
          buttons: pad.buttons.map((b) => Math.round(b.value * 100) / 100),
        });
      }
      setSnapshot({ supported: true, pads });
    };

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const pad = snapshot.pads[0];

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-5 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
      >
        <ArrowLeft size={15} />
        Back
      </Link>

      <h1 className="mt-6 flex items-center gap-2.5 text-2xl font-bold tracking-tight">
        <Gamepad2 size={22} className="text-primary-tint" />
        Controller diagnostics
      </h1>

      {!snapshot.supported && (
        <p className="mt-4 rounded-2xl border border-bad/30 bg-bad-dim px-4 py-3 text-sm text-bad-tint">
          This browser does not expose the Gamepad API at all.
        </p>
      )}

      {snapshot.supported && !pad && (
        <div className="mt-6 rounded-card border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm text-ink-dim">No controller visible yet</p>
          <p className="mx-auto mt-2 max-w-sm text-xs text-ink-muted">
            Browsers hide a gamepad until it is used. Press a button or move a stick on it now — this
            page updates the instant it appears.
          </p>
        </div>
      )}

      {pad && (
        <div className="mt-6 space-y-5">
          <div className="rounded-card border border-ok/30 bg-ok-dim p-4">
            <Micro className="text-ok-tint">Detected</Micro>
            <p className="mt-1 text-sm text-ink">{pad.id}</p>
            <p className="tnum mt-1 text-xs text-ink-muted">
              index {pad.index} · mapping {pad.mapping} · {pad.axes.length} axes ·{' '}
              {pad.buttons.length} buttons
            </p>
            {pad.mapping !== 'standard' && (
              <p className="mt-2 text-xs text-accent-tint">
                Non-standard mapping — button and axis positions may differ from the defaults the
                console assumes.
              </p>
            )}
          </div>

          {/* What the console would actually send. If the raw axes above move
              but this does not, the fault is the mapping, not the browser. */}
          <section className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <Micro>Mapped output</Micro>
              <span className="tnum text-[11px] text-ink-muted">{emitted.count} vectors sent</span>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="text-center">
                <Micro>X</Micro>
                <p className="tnum mt-1 text-lg text-ink">{emitted.x.toFixed(2)}</p>
              </div>
              <div className="h-8 w-px bg-line" />
              <div className="text-center">
                <Micro>Y</Micro>
                <p className="tnum mt-1 text-lg text-ink">{emitted.y.toFixed(2)}</p>
              </div>
              <div className="h-8 w-px bg-line" />
              <div className="min-w-0 flex-1">
                <Micro>Buttons seen</Micro>
                {actions.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-muted">none yet</p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {actions.map((a, i) => (
                      <li key={i} className="tnum truncate text-[11px] text-ink-dim">
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {status.connected && (
              <p className="mt-3 text-xs text-ok-tint">
                Hook is reading “{status.id}”.
              </p>
            )}
          </section>

          <section className="rounded-card border border-line bg-surface p-4">
            <Micro>Axes</Micro>
            <div className="mt-3 space-y-2">
              {pad.axes.map((value, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="tnum w-16 shrink-0 text-xs text-ink-muted">
                    axis {i}
                    {i === 0 ? ' ←→' : i === 1 ? ' ↑↓' : ''}
                  </span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                    <div className="absolute left-1/2 h-full w-px bg-line-strong" />
                    <div
                      className="absolute h-full rounded-full bg-primary-tint"
                      style={{
                        left: `${50 + Math.min(value, 0) * 50}%`,
                        width: `${Math.abs(value) * 50}%`,
                      }}
                    />
                  </div>
                  <span className="tnum w-12 shrink-0 text-right text-xs text-ink">
                    {value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-card border border-line bg-surface p-4">
            <Micro>Buttons</Micro>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {pad.buttons.map((value, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-center transition-colors',
                    value > 0.5
                      ? 'border-primary/50 bg-primary text-primary-on'
                      : value > 0.05
                        ? 'border-accent/40 bg-accent-dim text-accent-tint'
                        : 'border-line bg-sunken text-ink-muted'
                  )}
                >
                  <div className="tnum text-[10px]">{i}</div>
                  <div className="tnum text-xs">{value.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              The console expects: 0=A light · 1=B stop · 2=X panel · 6/7=triggers · 12–15=D-pad.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
