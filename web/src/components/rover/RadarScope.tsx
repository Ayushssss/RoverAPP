import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Radar, TriangleAlert, EyeOff } from 'lucide-react';
import { Micro } from '../ui/Bits';
import { cn } from '../../lib/cn';

/**
 * Forward scope for the night rover's range finder.
 *
 * ── What a contact is, and is not ─────────────────────────────
 *
 * An HC-SR04 reports the distance to whatever returned the burst. It cannot
 * tell a person from a chair leg, so every blip here is labelled a contact
 * rather than anything more specific. Calling them people would be a claim the
 * hardware cannot support, and the one time it mattered you would be trusting
 * a wall not to move.
 *
 * ── Why contacts sit on the centreline ────────────────────────
 *
 * The sensor is bolted facing forward, so there is exactly one bearing it can
 * report. Contacts therefore appear straight ahead and move in range, not
 * across the scope. The component already plots `bearingDeg` from the
 * telemetry, so mounting the sensor on a servo makes the fan appear here with
 * no change to this file.
 */

/** Outer ring. Beyond this the HC-SR04 rarely returns anything usable. */
const RANGE_CM = 200;

/** Matches STOP_CM in night_rover.ino — the band where it refuses to advance. */
const STOP_CM = 25;

/** Contacts fade out over this long, leaving a trail of the approach. */
const TRAIL_MS = 2600;

// Scope geometry. The rover sits at the flat edge, looking up the screen.
const CX = 150;
const CY = 152;
const R = 138;

type Contact = { id: number; bearing: number; range: number; at: number };

/** Polar (bearing in degrees from straight ahead, range in cm) to SVG x/y. */
function plot(bearing: number, range: number) {
  const rad = (bearing * Math.PI) / 180;
  const r = Math.min(range / RANGE_CM, 1) * R;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

/** The arc path for one range ring, left horizon to right horizon. */
function arc(radius: number) {
  return `M ${CX - radius} ${CY} A ${radius} ${radius} 0 0 1 ${CX + radius} ${CY}`;
}

export default function RadarScope({
  readings,
  connected,
}: {
  readings: Record<string, number>;
  connected: boolean;
}) {
  const distance = readings.distanceCm;
  const bearing = readings.bearingDeg ?? 0;
  const irBlocked = (readings.irBlocked ?? 0) > 0;
  const blocked = (readings.obstacle ?? 0) > 0;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const nextId = useRef(0);

  /*
    One contact per distinct reading.

    Keyed on the value rather than pushed on every telemetry frame: the rover
    reports at 2Hz whether or not anything changed, and appending regardless
    would stack identical dots on one spot until the trail looked like a solid
    blob rather than a track.
  */
  useEffect(() => {
    if (typeof distance !== 'number' || distance <= 0) return;
    setContacts((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.range - distance) < 1 && Math.abs(last.bearing - bearing) < 1) {
        return prev;
      }
      return [...prev, { id: nextId.current++, bearing, range: distance, at: Date.now() }];
    });
  }, [distance, bearing]);

  /*
    Expire on a timer rather than on arrival.

    A contact that stops being reported is exactly the case the trail should
    show fading away, and pruning only when the next reading lands would freeze
    the last dot on screen for as long as the sensor stayed silent — which is
    precisely when it is claiming nothing is there.
  */
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - TRAIL_MS;
      setContacts((prev) => (prev.some((c) => c.at < cutoff)
        ? prev.filter((c) => c.at >= cutoff)
        : prev));
    }, 200);
    return () => clearInterval(t);
  }, []);

  // Clear the scope when the link drops. Stale contacts on a dead link read as
  // current, and that is the reading you would act on.
  useEffect(() => {
    if (!connected) setContacts([]);
  }, [connected]);

  const rings = useMemo(() => [0.25, 0.5, 0.75, 1].map((f) => ({
    f,
    radius: R * f,
    label: Math.round(RANGE_CM * f),
  })), []);

  const stopRadius = (STOP_CM / RANGE_CM) * R;
  const live = connected && typeof distance === 'number' && distance > 0;

  return (
    <div className="rounded-card border border-line bg-surface/60 p-5">
      <style>{`
        @keyframes radar-sweep {
          from { transform: rotate(-88deg); }
          to   { transform: rotate(88deg); }
        }
        .radar-arm {
          transform-origin: ${CX}px ${CY}px;
          animation: radar-sweep 2.8s cubic-bezier(.45,0,.55,1) infinite alternate;
        }
        @media (prefers-reduced-motion: reduce) {
          .radar-arm { animation: none; transform: rotate(0deg); }
        }
      `}</style>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Radar size={15} className={cn(live ? 'text-primary-tint' : 'text-ink-muted')} />
          <span className="text-sm font-semibold text-ink">Forward scope</span>
        </div>
        {blocked ? (
          <span className="flex items-center gap-1.5 rounded-full bg-bad-dim px-2.5 py-1 text-xs font-semibold text-bad-tint">
            <TriangleAlert size={12} />
            {irBlocked && !(typeof distance === 'number' && distance < STOP_CM)
              ? 'IR contact'
              : 'Too close'}
          </span>
        ) : (
          <Micro>{live ? 'clear' : 'no echo'}</Micro>
        )}
      </div>

      <svg
        viewBox="0 0 300 172"
        className="w-full"
        role="img"
        aria-label={
          live
            ? `Contact at ${Math.round(distance)} centimetres ahead`
            : 'No contact within range'
        }
      >
        <defs>
          {/* The sweep wedge: bright at the arm, gone a few degrees behind it. */}
          <linearGradient id="radar-sweep-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="radar-floor" cx="50%" cy="100%" r="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.10" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
          </radialGradient>
        </defs>

        {/* Scope floor */}
        <path
          d={`${arc(R)} Z`}
          className="text-primary"
          fill="url(#radar-floor)"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="1"
        />

        {/* The band the rover refuses to drive into. Drawn under everything
            else so a contact inside it still reads clearly. */}
        <path
          d={`${arc(stopRadius)} Z`}
          className="text-bad"
          fill="currentColor"
          fillOpacity={blocked ? 0.22 : 0.09}
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1"
        />

        {/* Range rings */}
        {rings.map((ring) => (
          <g key={ring.f}>
            <path
              d={arc(ring.radius)}
              fill="none"
              className="text-ink"
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeWidth="1"
              strokeDasharray={ring.f === 1 ? undefined : '2 4'}
            />
            <text
              x={CX + 3}
              y={CY - ring.radius + 11}
              className="fill-ink-muted"
              fontSize="8"
              fontFamily="ui-monospace, monospace"
            >
              {ring.label}
            </text>
          </g>
        ))}

        {/* Bearing spokes every 30 degrees */}
        {[-60, -30, 0, 30, 60].map((deg) => {
          const p = plot(deg, RANGE_CM);
          return (
            <line
              key={deg}
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              className="text-ink"
              stroke="currentColor"
              strokeOpacity={deg === 0 ? 0.18 : 0.08}
              strokeWidth="1"
            />
          );
        })}

        {/* Sweep. Decorative — the sensor does not physically scan — but it is
            the signal that the scope is live, and it stops when the link does. */}
        {connected && (
          <g className="radar-arm text-primary">
            <path
              d={`M ${CX} ${CY} L ${CX - 34} ${CY - R} A ${R} ${R} 0 0 1 ${CX + 34} ${CY - R} Z`}
              fill="url(#radar-sweep-grad)"
            />
            <line
              x1={CX}
              y1={CY}
              x2={CX}
              y2={CY - R}
              stroke="currentColor"
              strokeOpacity="0.5"
              strokeWidth="1.25"
            />
          </g>
        )}

        {/*
          The trail: where the contact has been, oldest faintest.

          The fade is animated per dot rather than computed from Date.now() at
          render. Age-at-render only advances when something else re-renders
          the component, so the trail would sit at whatever opacity it had when
          the last reading landed and then vanish in one step — most visibly
          when the sensor goes quiet, which is exactly when the trail is the
          only thing on screen.
        */}
        {contacts.map((c) => {
          const p = plot(c.bearing, c.range);
          return (
            <motion.circle
              key={c.id}
              cx={p.x}
              cy={p.y}
              r="2.5"
              className={c.range < STOP_CM ? 'text-bad' : 'text-primary'}
              fill="currentColor"
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              transition={{ duration: TRAIL_MS / 1000, ease: 'linear' }}
            />
          );
        })}

        {/*
          The current contact, drawn straight from the live reading rather than
          from the trail.

          Keeping it out of the trail is what makes a STATIONARY contact behave.
          Trail entries expire, and an unchanged reading is deliberately not
          re-added — so a rover parked facing a wall at a steady 47cm would blip
          once and then show an empty scope, with the sensor reporting perfectly
          the whole time. Reading it from props means it is on screen for
          exactly as long as the rover can see it.
        */}
        {live && (
          <g className={distance < STOP_CM ? 'text-bad' : 'text-primary'}>
            <motion.circle
              cx={plot(bearing, distance).x}
              cy={plot(bearing, distance).y}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              initial={{ r: 3, opacity: 0.7 }}
              animate={{ r: 15, opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
            />
            <circle
              cx={plot(bearing, distance).x}
              cy={plot(bearing, distance).y}
              r="4"
              fill="currentColor"
            />
          </g>
        )}

        {/* The rover */}
        <g>
          <circle cx={CX} cy={CY} r="4.5" className="fill-primary" />
          <circle cx={CX} cy={CY} r="9" fill="none" className="stroke-primary" strokeOpacity="0.3" strokeWidth="1" />
        </g>

        {/* IR near-field. It reaches only centimetres, so it is drawn as a
            state on the rover rather than a contact out on the scope. */}
        {irBlocked && (
          <path
            d={`M ${CX - 26} ${CY} A 26 26 0 0 1 ${CX + 26} ${CY} Z`}
            className="text-bad"
            fill="currentColor"
            fillOpacity="0.5"
          />
        )}
      </svg>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Readout
          label="Range"
          value={live ? `${Math.round(distance)}` : '--'}
          unit={live ? 'cm' : ''}
          tone={live && distance < STOP_CM ? 'bad' : 'normal'}
        />
        {/* The trail, not the contact count — there is one contact at most,
            since one fixed sensor reports one range. */}
        <Readout label="Trail" value={String(contacts.length)} unit="" tone="normal" />
        <Readout
          label="IR"
          value={irBlocked ? 'BLOCK' : 'clear'}
          unit=""
          tone={irBlocked ? 'bad' : 'normal'}
        />
      </div>

      {!connected && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
          <EyeOff size={12} />
          Scope is idle — the rover is not connected.
        </p>
      )}
    </div>
  );
}

function Readout({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: 'normal' | 'bad';
}) {
  return (
    <div>
      <Micro>{label}</Micro>
      <p
        className={cn(
          'mt-1 font-mono text-lg font-semibold tabular-nums',
          tone === 'bad' ? 'text-bad-tint' : 'text-ink'
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-ink-muted">{unit}</span>}
      </p>
    </div>
  );
}
