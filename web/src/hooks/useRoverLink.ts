import { useCallback, useEffect, useRef, useState } from 'react';
import * as relay from '../services/relay';
import type { BoardInfo, LinkState } from '../services/relay';
import type { Direction } from '../components/rover/DPad';
import type { Rover } from '../lib/store';
import { DriveSessionLog, TelemetryRecorder } from '../services/history';

/** Directions as stick vectors at full deflection. */
const VECTORS: Record<Direction, { x: number; y: number }> = {
  forward: { x: 0, y: 1 },
  backward: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const KEYS: Record<string, Direction> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/**
 * Everything one rover needs: the link, its boards, its readings, and the
 * controls that drive it.
 *
 * Directions go out as *joystick vectors* rather than as the discrete
 * `forward`/`left` commands the firmware also understands. The rover already
 * treats a stick vector as a continuous instruction, so holding a direction
 * becomes "keep sending this vector" with no firmware change and no new message
 * type.
 */
export function useRoverLink(rover: Rover | null) {
  const mac = rover?.macAddress ?? '';
  const [link, setLink] = useState<LinkState>(relay.getLinkState());
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [readings, setReadings] = useState<Record<string, number>>({});
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState<Direction | null>(null);
  const [lightOn, setLightOn] = useState(false);
  const [roverIp, setRoverIp] = useState<string | null>(null);
  const [camera, setCamera] = useState<relay.CameraStatus>({ available: false, ip: null });
  /** Set when a physical tilt controller is steering, so the stick can mirror it. */
  const [external, setExternal] = useState<{ x: number; y: number } | null>(null);

  /** Last vector, re-sent while held so the rover's failsafe stays fed. */
  const heading = useRef({ x: 0, y: 0 });
  /** Recorders, present only when Supabase is configured. */
  const recorder = useRef<TelemetryRecorder | null>(null);
  const driveLog = useRef<DriveSessionLog | null>(null);

  useEffect(() => {
    let alive = true;
    const offState = relay.onLinkState((s) => alive && setLink(s));

    const cleanups: Array<() => void> = [];

    (async () => {
      try {
        await relay.acquire();
        if (!alive) return;
        // Subscriptions are attached *after* the socket exists — attaching them
        // to a null socket is silent and leaves a screen that never updates.
        relay.registerRover(mac);
        cleanups.push(
          relay.onDeviceIp(mac, (ip) => alive && setRoverIp(ip)),
          relay.onBoards(mac, (list) => alive && setBoards(list)),
          // Readings merge rather than replace: a hub may report temperature on
          // one cadence and a slower sensor on another, and replacing would
          // make the slower values blink out between updates.
          relay.onTelemetry(mac, (next) => alive && setReadings((p) => ({ ...p, ...next }))),
          relay.onCameraAvailable(mac, (status) => alive && setCamera(status)),
          relay.onControllerInput(mac, (x, y) => {
            if (!alive) return;
            setCoords({ x, y });
            setExternal({ x, y });
          })
        );
      } catch {
        /* onLinkState already reflects the failure; nothing to add. */
      }
    })();

    return () => {
      alive = false;
      offState();
      cleanups.forEach((c) => c());
      relay.release();
    };
  }, [mac]);

  /**
   * History, when a database is configured.
   *
   * Started and closed alongside the link so the recorder's lifetime is exactly
   * the time somebody was looking at this rover. Both close on unmount, which
   * is also the final flush — the interesting minute is usually the one right
   * before you navigate away.
   */
  useEffect(() => {
    if (!rover) return;

    const tel = new TelemetryRecorder(rover);
    const drive = new DriveSessionLog(rover);
    recorder.current = tel;
    driveLog.current = drive;

    void tel.start();
    void drive.start();

    return () => {
      recorder.current = null;
      driveLog.current = null;
      void tel.close();
      void drive.close();
    };
  }, [rover?.id, rover?.macAddress]);

  // Pushed from the rendered state rather than from inside the socket handler,
  // so a reading is only recorded once no matter how the subscription is torn
  // down and rebuilt.
  useEffect(() => {
    if (Object.keys(readings).length > 0) recorder.current?.push(readings);
  }, [readings]);

  /**
   * Keeps the rover's failsafe fed.
   *
   * Two cases need it: the stick only emits while the pointer is actually
   * moving, so a held heading goes silent, and a held key or pad button sends
   * nothing after the initial press. Either way the rover cuts motors after its
   * 1s timeout. Four times a second sits comfortably inside that and costs
   * nothing when centred.
   */
  useEffect(() => {
    const id = setInterval(() => {
      const { x, y } = heading.current;
      if (x !== 0 || y !== 0) relay.sendJoystick(mac, x, y);
    }, 250);
    return () => clearInterval(id);
  }, [mac]);

  /**
   * Stop when the tab goes away.
   *
   * The repeat above is what makes this necessary. Input sources stop feeding
   * it in a hidden tab — `requestAnimationFrame` is suspended, so the gamepad
   * poll halts and key-ups land in another window — but the interval itself
   * keeps firing (throttled, though still inside the rover's 1s timeout) and
   * would go on re-sending the last vector to a rover nobody is watching.
   *
   * `pagehide` covers the cases `visibilitychange` misses: closing the tab,
   * navigating away, and the iOS back-forward cache.
   */
  useEffect(() => {
    const halt = () => {
      if (heading.current.x === 0 && heading.current.y === 0) return;
      heading.current = { x: 0, y: 0 };
      setHeld(null);
      setCoords({ x: 0, y: 0 });
      relay.sendCommand(mac, 'stop');
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') halt();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', halt);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', halt);
    };
  }, [mac]);

  const drive = useCallback(
    (x: number, y: number) => {
      // Taking the stick overrides a held direction — two things steering at
      // once would fight, and the stick is the more direct intent.
      setHeld(null);
      setExternal(null);
      heading.current = { x, y };
      setCoords({ x, y });
      driveLog.current?.note(x, y);
      return relay.sendJoystick(mac, x, y);
    },
    [mac]
  );

  const stop = useCallback(() => {
    // Clear the heading *first*: the repeat tick fires every 250ms and would
    // otherwise re-send the direction just after the stop, driving on for
    // another second until the failsafe caught it.
    heading.current = { x: 0, y: 0 };
    setHeld(null);
    setExternal(null);
    setCoords({ x: 0, y: 0 });
    return relay.sendCommand(mac, 'stop');
  }, [mac]);

  const startDirection = useCallback(
    (dir: Direction) => {
      const v = VECTORS[dir];
      const sent = relay.sendJoystick(mac, v.x, v.y);
      if (!sent) return false;
      heading.current = v;
      setHeld(dir);
      setExternal(null);
      setCoords(v);
      driveLog.current?.note(v.x, v.y);
      return true;
    },
    [mac]
  );

  const endDirection = useCallback(() => {
    heading.current = { x: 0, y: 0 };
    setHeld(null);
    setCoords({ x: 0, y: 0 });
    relay.sendCommand(mac, 'stop');
  }, [mac]);

  const toggleLight = useCallback(() => {
    // The headlight carries the state it is switching *to*, so the board
    // follows the console rather than keeping its own flag that drifts the
    // first time a command is dropped.
    const next = !lightOn;
    const sent = relay.sendCommand(mac, 'light', next ? 1 : 0);
    if (sent) setLightOn(next);
    return sent;
  }, [mac, lightOn]);

  /**
   * Keyboard drive: WASD / arrows to steer, space to stop.
   *
   * Auto-repeat is ignored — a held key fires `keydown` continuously, and
   * restarting the direction on every repeat would reset the latch dozens of
   * times a second. Losing window focus stops the rover, because a key-up that
   * arrives at another window never arrives here.
   */
  const bindKeyboard = useCallback(
    (enabled: boolean) => {
      if (!enabled) return () => {};

      const down = (e: KeyboardEvent) => {
        if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
        const target = e.target as HTMLElement | null;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

        if (e.code === 'Space') {
          e.preventDefault();
          stop();
          return;
        }
        const dir = KEYS[e.code];
        if (!dir) return;
        e.preventDefault();
        startDirection(dir);
      };

      const up = (e: KeyboardEvent) => {
        const dir = KEYS[e.code];
        if (dir) endDirection();
      };

      const blur = () => endDirection();

      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      window.addEventListener('blur', blur);
      return () => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
        window.removeEventListener('blur', blur);
      };
    },
    [startDirection, endDirection, stop]
  );

  return {
    link,
    connected: link === 'up',
    boards,
    readings,
    coords,
    /**
     * The live vector, as a ref.
     *
     * Handed out so the 3D attitude rig can read it every frame without the
     * stick's 25Hz stream re-rendering the page. `coords` is the same value for
     * anything that genuinely needs to re-render, like the mono readouts.
     */
    headingRef: heading,
    held,
    lightOn,
    roverIp,
    camera,
    external,
    hasSensorHub: boards.some((b) => b.role === 'sensor'),
    hasController: boards.some((b) => b.role === 'controller'),
    drive,
    stop,
    startDirection,
    endDirection,
    toggleLight,
    bindKeyboard,
  };
}
