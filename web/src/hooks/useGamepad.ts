import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Physical controller support.
 *
 * A gamepad's inputs reduce to the `{x, y}` vector the rover already treats as
 * a continuous drive instruction, so this needs no new wire format and no
 * firmware change — it is another source for the same message the on-screen
 * stick and the D-pad already send.
 *
 * Two properties of the Gamepad API drive the shape of this hook:
 *
 *   • There are no input events. `navigator.getGamepads()` returns a *snapshot*
 *     that only refreshes when you call it, so the state has to be polled.
 *   • A controller stays invisible until the user presses something. Chrome
 *     will not report a pad that has been plugged in but never touched, which
 *     is why the UI says "press any button" rather than "no controller".
 */

/**
 * Standard-layout indices.
 *
 * Named for both families because the same index is A on Xbox and Cross on
 * PlayStation, and a comment that picks one is a comment that misleads half
 * the time.
 */
const BUTTON = {
  /** A (Xbox) · Cross (PlayStation) */
  SOUTH: 0,
  /** B · Circle */
  EAST: 1,
  /** X · Square */
  WEST: 2,
  /** Y · Triangle */
  NORTH: 3,
  /** LB · L1 */
  L1: 4,
  /** RB · R1 */
  R1: 5,
  /** LT · L2 */
  L2: 6,
  /** RT · R2 */
  R2: 7,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

/** Matches the on-screen stick, so both controls feel the same at rest. */
const DEAD_ZONE = 0.06;
/** 25Hz, the same cadence the touch stick emits at. */
const EMIT_MS = 40;
/** Triggers rest slightly off zero; below this one is considered released. */
const TRIGGER_FLOOR = 0.05;
/** Re-issued at this interval while driving — each effect has a finite duration. */
const RUMBLE_MS = 220;

export type GamepadAction = 'light' | 'stop' | 'panel';

/** L1 halves the throttle for close work; R1 removes the normal 85% ceiling. */
export type SpeedMode = 'precision' | 'normal' | 'turbo';

const SPEED_SCALE: Record<SpeedMode, number> = {
  precision: 0.4,
  normal: 0.85,
  turbo: 1,
};

export interface GamepadStatus {
  connected: boolean;
  /** The device's own name, e.g. "Xbox Wireless Controller". */
  id: string | null;
  /** Live deflection 0–1, for a UI meter. Updated at the emit rate. */
  magnitude: number;
  speed: SpeedMode;
}

interface Options {
  enabled: boolean;
  /** Called with the drive vector whenever it changes materially. */
  onVector: (x: number, y: number) => void;
  /** Called once per press, not once per frame. */
  onAction: (action: GamepadAction) => void;
  /**
   * Whether the relay is up. Drives the disconnection alert — the point of a
   * controller is that you are looking at the rover, not at the screen, so a
   * dropped link has to be felt rather than displayed.
   */
  linkUp?: boolean;
}

interface HapticActuator {
  playEffect?: (
    type: 'dual-rumble',
    params: { duration: number; strongMagnitude?: number; weakMagnitude?: number }
  ) => Promise<string>;
}

export function useGamepad({ enabled, onVector, onAction, linkUp = true }: Options): GamepadStatus {
  const [status, setStatus] = useState<GamepadStatus>({
    connected: false,
    id: null,
    magnitude: 0,
    speed: 'normal',
  });

  const raf = useRef(0);
  const lastEmit = useRef(0);
  const lastVector = useRef({ x: 0, y: 0 });
  const pressed = useRef<Set<number>>(new Set());
  const padIndex = useRef<number | null>(null);
  const lastRumble = useRef(0);
  const wasLinkUp = useRef(true);
  const speedRef = useRef<SpeedMode>('normal');

  const vectorCb = useRef(onVector);
  const actionCb = useRef(onAction);
  const linkRef = useRef(linkUp);
  useEffect(() => {
    vectorCb.current = onVector;
    actionCb.current = onAction;
    linkRef.current = linkUp;
  }, [onVector, onAction, linkUp]);

  /**
   * Fire a haptic effect.
   *
   * `force` bypasses the rate limit for one-shot confirmations. Everything
   * continuous goes through the limiter, because `playEffect` queues and a call
   * per frame turns the pad into a permanent buzz that drowns out the events
   * actually worth feeling.
   */
  const rumble = useCallback((duration: number, strength: number, force = false) => {
    if (padIndex.current === null) return;
    const now = performance.now();
    if (!force && now - lastRumble.current < RUMBLE_MS) return;
    lastRumble.current = now;

    const pad = navigator.getGamepads?.()[padIndex.current];
    const actuator = (pad as unknown as { vibrationActuator?: HapticActuator } | null)
      ?.vibrationActuator;
    actuator
      ?.playEffect?.('dual-rumble', {
        duration,
        strongMagnitude: Math.min(Math.max(strength, 0), 1),
        weakMagnitude: Math.min(Math.max(strength * 0.6, 0), 1),
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || typeof navigator.getGamepads !== 'function') {
      setStatus({ connected: false, id: null, magnitude: 0, speed: 'normal' });
      return;
    }

    let alive = true;

    const firstPad = (): Gamepad | null => {
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        // `mapping === 'standard'` is not required — plenty of usable pads
        // report an empty mapping — but a pad with no axes cannot steer.
        if (pad && pad.connected && pad.axes.length >= 2) return pad;
      }
      return null;
    };

    const poll = () => {
      if (!alive) return;
      raf.current = requestAnimationFrame(poll);

      const pad = firstPad();

      if (!pad) {
        if (padIndex.current !== null) {
          padIndex.current = null;
          pressed.current.clear();
          // A controller unplugged mid-drive must not leave the rover holding
          // its last vector until the failsafe notices.
          lastVector.current = { x: 0, y: 0 };
          vectorCb.current(0, 0);
          setStatus({ connected: false, id: null, magnitude: 0, speed: 'normal' });
        }
        return;
      }

      if (padIndex.current !== pad.index) {
        padIndex.current = pad.index;
        setStatus({ connected: true, id: pad.id, magnitude: 0, speed: speedRef.current });
        rumble(120, 0.4, true);
      }

      const value = (i: number) => pad.buttons[i]?.value ?? 0;
      const isDown = (i: number) => {
        const button = pad.buttons[i];
        return button ? button.pressed || button.value > 0.5 : false;
      };

      /* ── buttons, on the rising edge only ─────────────────────────── */

      const edge = (i: number): boolean => {
        const down = isDown(i);
        const was = pressed.current.has(i);
        if (down && !was) {
          pressed.current.add(i);
          return true;
        }
        if (!down && was) pressed.current.delete(i);
        return false;
      };

      /*
        Stop is bound to both bottom face buttons.

        "X" means Cross (index 0) on PlayStation and the west button (index 2)
        on Xbox. Rather than pick one and be wrong for half the pads, an
        emergency stop answers to both — a safety control is the right place to
        be generous, and nothing else needs those two indices.
      */
      if (edge(BUTTON.SOUTH) || edge(BUTTON.WEST)) {
        actionCb.current('stop');
        rumble(240, 1, true);
      }
      if (edge(BUTTON.EAST)) {
        actionCb.current('light');
        rumble(60, 0.35, true);
      }
      if (edge(BUTTON.NORTH)) {
        actionCb.current('panel');
        rumble(40, 0.25, true);
      }

      /* ── speed mode ───────────────────────────────────────────────── */

      const speed: SpeedMode = isDown(BUTTON.L1)
        ? 'precision'
        : isDown(BUTTON.R1)
          ? 'turbo'
          : 'normal';
      if (speed !== speedRef.current) {
        speedRef.current = speed;
        setStatus((prev) => (prev.connected ? { ...prev, speed } : prev));
        rumble(50, speed === 'turbo' ? 0.5 : 0.2, true);
      }

      /* ── drive vector ─────────────────────────────────────────────── */

      let x = pad.axes[0] ?? 0;
      let y = 0;

      // Triggers are the throttle: R2 forward, L2 back, and their difference
      // when both are held so a rider never gets a surprise from stale input.
      const r2 = value(BUTTON.R2);
      const l2 = value(BUTTON.L2);
      const triggerThrottle =
        (r2 > TRIGGER_FLOOR ? r2 : 0) - (l2 > TRIGGER_FLOOR ? l2 : 0);

      // The D-pad overrides everything at full deflection, so a thumb resting
      // on a drifting stick cannot fight a deliberate direction press.
      const dUp = isDown(BUTTON.DPAD_UP);
      const dDown = isDown(BUTTON.DPAD_DOWN);
      const dLeft = isDown(BUTTON.DPAD_LEFT);
      const dRight = isDown(BUTTON.DPAD_RIGHT);

      if (dUp || dDown || dLeft || dRight) {
        x = dLeft ? -1 : dRight ? 1 : 0;
        y = dUp ? 1 : dDown ? -1 : 0;
      } else if (Math.abs(triggerThrottle) > 0) {
        y = triggerThrottle;
      } else {
        // Left stick as the fallback throttle. Screen and stick conventions
        // disagree about which way is up; the rover wants forward positive.
        y = -(pad.axes[1] ?? 0);
      }

      // Radial dead zone, then rescaled so the usable range still reaches 1.0 —
      // without the rescale the first 6% of real travel is simply lost.
      const magnitude = Math.hypot(x, y);
      if (magnitude < DEAD_ZONE) {
        x = 0;
        y = 0;
      } else {
        const scaled = Math.min((magnitude - DEAD_ZONE) / (1 - DEAD_ZONE), 1);
        x = (x / magnitude) * scaled;
        y = (y / magnitude) * scaled;
      }

      const scale = SPEED_SCALE[speed];
      x = Math.round(x * scale * 100) / 100;
      y = Math.round(y * scale * 100) / 100;

      /* ── haptics ──────────────────────────────────────────────────── */

      const moving = x !== 0 || y !== 0;

      // A double-strength pulse the moment the relay drops, because whoever is
      // holding this is watching the rover, not the badge on screen.
      if (linkRef.current !== wasLinkUp.current) {
        if (!linkRef.current) rumble(400, 0.9, true);
        wasLinkUp.current = linkRef.current;
      } else if (moving && linkRef.current) {
        // Engine feel: proportional to speed, and deliberately faint. Rate
        // limited, so this re-issues about four times a second.
        rumble(RUMBLE_MS, Math.min(Math.hypot(x, y), 1) * 0.22);
      }

      /* ── emit ─────────────────────────────────────────────────────── */

      const now = performance.now();
      const changed = x !== lastVector.current.x || y !== lastVector.current.y;
      // Rate-limited to the touch stick's cadence, but a return to centre goes
      // immediately — a stop should never wait out a throttle window.
      const stopping = changed && !moving;

      if (changed && (stopping || now - lastEmit.current >= EMIT_MS)) {
        lastEmit.current = now;
        lastVector.current = { x, y };
        vectorCb.current(x, y);
        setStatus((prev) =>
          prev.connected ? { ...prev, magnitude: Math.min(Math.hypot(x, y), 1) } : prev
        );
      }
    };

    // `gamepadconnected` is what un-hides a pad that was plugged in before the
    // page loaded — the browser withholds it until the user presses something.
    const onConnect = () => {
      if (!raf.current) raf.current = requestAnimationFrame(poll);
    };

    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onConnect);
    raf.current = requestAnimationFrame(poll);

    return () => {
      alive = false;
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onConnect);
      padIndex.current = null;
      pressed.current.clear();
    };
  }, [enabled, rumble]);

  return status;
}
