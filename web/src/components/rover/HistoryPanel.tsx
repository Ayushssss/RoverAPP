import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Database, RefreshCw, Table2, LineChart as LineIcon, Loader2 } from 'lucide-react';
import { fetchHistory } from '../../services/history';
import { supabaseConfigured, type TelemetrySample } from '../../services/supabase';
import { SENSOR_META } from '../../lib/config';
import Button, { IconButton } from '../ui/Button';
import { Micro } from '../ui/Bits';
import { cn } from '../../lib/cn';

/**
 * Recorded telemetry, as small multiples.
 *
 * One facet per sensor rather than one chart with every series on it. Soil sits
 * around 40, lux around 12,000 — on shared axes the soil trace is a flat line
 * along the bottom and tells you nothing. The alternative people reach for is a
 * second y-axis, which is worse: two scales on one frame makes crossings look
 * meaningful when they are an artifact of where the axes were placed.
 *
 * Each facet carries one series, so the facet title is the identity and no
 * legend is needed. All facets share one hue for the same reason — a colour
 * that varies without meaning is a colour the reader has to decode.
 */

const W = 320;
const H = 96;
const PAD = { top: 8, right: 8, bottom: 16, left: 34 };

interface Facet {
  key: string;
  label: string;
  unit: string;
  digits: number;
  points: Array<{ t: number; v: number }>;
  min: number;
  max: number;
}

function buildFacets(samples: TelemetrySample[]): Facet[] {
  const byKey = new Map<string, Array<{ t: number; v: number }>>();

  for (const sample of samples) {
    const t = new Date(sample.recorded_at).getTime();
    for (const [key, value] of Object.entries(sample.readings)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const list = byKey.get(key) ?? [];
      list.push({ t, v: value });
      byKey.set(key, list);
    }
  }

  return [...byKey.entries()]
    .filter(([, points]) => points.length > 1)
    .map(([key, points]) => {
      const meta = SENSOR_META[key];
      const values = points.map((p) => p.v);
      let min = Math.min(...values);
      let max = Math.max(...values);
      // A sensor that has not moved would otherwise divide by zero and draw at
      // the top of the frame. Pad it so a flat reading looks flat.
      if (max - min < 1e-6) {
        min -= 1;
        max += 1;
      }
      return {
        key,
        label: meta?.label ?? key,
        unit: meta?.unit ?? '',
        digits: meta?.digits ?? 2,
        points,
        min,
        max,
      };
    });
}

function Sparkline({ facet }: { facet: Facet }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const t0 = facet.points[0].t;
  const t1 = facet.points[facet.points.length - 1].t;
  const span = t1 - t0 || 1;

  const x = (t: number) => PAD.left + ((t - t0) / span) * plotW;
  const y = (v: number) => PAD.top + plotH - ((v - facet.min) / (facet.max - facet.min)) * plotH;

  const path = facet.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${path} L${x(t1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${x(t0).toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`;

  const latest = facet.points[facet.points.length - 1];
  const active = hover !== null ? facet.points[hover] : null;

  // Hit targets are wider than the marks: the pointer snaps to the nearest
  // sample rather than requiring you to land on a 2px line.
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const target = t0 + ((px - PAD.left) / plotW) * span;
    let best = 0;
    let bestD = Infinity;
    facet.points.forEach((p, i) => {
      const d = Math.abs(p.t - target);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const fmt = (v: number) => `${v.toFixed(facet.digits)}${facet.unit}`;

  return (
    <figure className="m-0 rounded-2xl border border-line bg-surface p-3.5">
      <figcaption className="flex items-baseline justify-between gap-2">
        <Micro className="text-ink-dim">{facet.label}</Micro>
        <span className="tnum text-sm text-ink">{fmt(active ? active.v : latest.v)}</span>
      </figcaption>

      <div className="relative mt-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          style={{ height: H }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${facet.label} over time, ${fmt(facet.min)} to ${fmt(facet.max)}`}
        >
          {/* Recessive grid: two rules, no box. */}
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + plotH * f}
              y2={PAD.top + plotH * f}
              stroke="var(--c-grid)"
              strokeWidth={1}
            />
          ))}

          {/* Axis ticks, tabular so they can't shuffle width between renders. */}
          <text x={2} y={PAD.top + 4} className="tnum" fontSize={8} fill="var(--c-ink-muted)">
            {facet.max.toFixed(facet.digits)}
          </text>
          <text x={2} y={PAD.top + plotH} className="tnum" fontSize={8} fill="var(--c-ink-muted)">
            {facet.min.toFixed(facet.digits)}
          </text>

          <path d={area} fill="var(--c-series)" opacity={0.1} />
          <path
            d={path}
            fill="none"
            stroke="var(--c-series)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {active && (
            <>
              <line
                x1={x(active.t)}
                x2={x(active.t)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--c-ink-muted)"
                strokeWidth={1}
              />
              {/* A surface ring keeps the marker legible where it crosses the
                  line it belongs to. */}
              <circle
                cx={x(active.t)}
                cy={y(active.v)}
                r={4.5}
                fill="var(--c-series)"
                stroke="var(--c-surface)"
                strokeWidth={2}
              />
            </>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute -top-1 rounded-lg border border-line bg-raised px-2 py-1 text-[11px] elev-2"
            style={{
              left: `${(x(active.t) / W) * 100}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <span className="tnum text-ink">{fmt(active.v)}</span>
            <span className="tnum ml-1.5 text-ink-muted">
              {new Date(active.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
      </div>
    </figure>
  );
}

function HistoryTable({ facets, samples }: { facets: Facet[]; samples: TelemetrySample[] }) {
  const rows = samples.slice(-40).reverse();
  return (
    <div className="max-h-96 overflow-auto rounded-2xl border border-line">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 bg-raised">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold text-ink-dim">
              Time
            </th>
            {facets.map((f) => (
              <th key={f.key} scope="col" className="px-3 py-2 font-semibold text-ink-dim">
                {f.label}
                {f.unit && <span className="text-ink-muted"> ({f.unit})</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="tnum px-3 py-1.5 text-ink-muted">
                {new Date(s.recorded_at).toLocaleTimeString()}
              </td>
              {facets.map((f) => {
                const v = s.readings[f.key];
                return (
                  <td key={f.key} className="tnum px-3 py-1.5 text-ink-2">
                    {typeof v === 'number' ? v.toFixed(f.digits) : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HistoryPanel({ mac }: { mac: string }) {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const load = async () => {
    setLoading(true);
    setSamples(await fetchHistory(mac));
    setLoading(false);
  };

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    void load();
  }, [mac]);

  const facets = useMemo(() => buildFacets(samples), [samples]);

  // Not configured is a different state from configured-and-empty, and saying
  // so is the difference between "set this up" and "wait for readings".
  if (!supabaseConfigured) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-10 text-center">
        <Database size={24} className="text-ink-muted" />
        <p className="text-sm text-ink-dim">History needs a database</p>
        <p className="max-w-sm text-xs text-ink-muted">
          The relay forwards readings and forgets them. Set{' '}
          <span className="tnum">VITE_SUPABASE_URL</span> and{' '}
          <span className="tnum">VITE_SUPABASE_PUBLISHABLE_KEY</span>, run the migration in{' '}
          <span className="tnum">web/supabase/migrations</span>, and this fills in as the rover
          reports.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-dim">
        <Loader2 size={16} className="animate-spin" />
        Reading history…
      </div>
    );
  }

  if (facets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-10 text-center">
        <Database size={24} className="text-ink-muted" />
        <p className="text-sm text-ink-dim">Nothing recorded yet</p>
        <p className="max-w-sm text-xs text-ink-muted">
          Readings are written in twenty-second batches while this console is open. Leave it running
          with a sensor hub online and the traces build up here.
        </p>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw size={14} />
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Micro className="text-ink-dim">
          {samples.length} samples ·{' '}
          {new Date(samples[0].recorded_at).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          onward
        </Micro>
        <div className="flex items-center gap-1.5">
          <IconButton
            icon={view === 'chart' ? <Table2 size={15} /> : <LineIcon size={15} />}
            label={view === 'chart' ? 'Show as table' : 'Show as charts'}
            onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
            className="h-9 w-9 rounded-xl"
          />
          <IconButton
            icon={<RefreshCw size={15} />}
            label="Reload history"
            onClick={load}
            className="h-9 w-9 rounded-xl"
          />
        </div>
      </div>

      {view === 'chart' ? (
        <div className={cn('grid gap-3', facets.length > 1 && 'sm:grid-cols-2')}>
          {facets.map((facet, i) => (
            <motion.div
              key={facet.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <Sparkline facet={facet} />
            </motion.div>
          ))}
        </div>
      ) : (
        <HistoryTable facets={facets} samples={samples} />
      )}
    </div>
  );
}
