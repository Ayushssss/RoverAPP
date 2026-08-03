import React, { useEffect, useRef, useState } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { useReducedMotion } from '../motion';

interface Props {
  value: number;
  /** Rendered around the counted figure, e.g. `(n) => `${n}%``. */
  format?: (n: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/**
 * Counts up to `value` when it changes.
 *
 * Runs on the JS thread via rAF rather than as a worklet: animating text
 * content means crossing back to JS for every frame anyway, so a worklet buys
 * nothing here. It only runs for a few hundred milliseconds when a figure
 * actually changes, and never on a static screen.
 *
 * Eased with easeOutCubic so the number decelerates into its final value
 * instead of stopping dead.
 */
export default function AnimatedNumber({
  value, format = (n) => `${n}`, duration = 900, style, numberOfLines,
}: Props) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);
  const from = useRef(value);

  useEffect(() => {
    if (reduced || duration <= 0) {
      setDisplay(value);
      from.current = value;
      return;
    }

    const start = Date.now();
    const origin = from.current;
    const delta = value - origin;

    if (delta === 0) return;

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      setDisplay(Math.round(origin + delta * eased));

      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        from.current = value;
        frame.current = null;
      }
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      // Land on the target so an interrupted count never leaves a stale figure
      // on screen.
      from.current = value;
    };
  }, [value, duration, reduced]);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {format(display)}
    </Text>
  );
}
