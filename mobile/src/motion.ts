import {
  Easing,
  ReduceMotion,
  type WithTimingConfig,
  type WithSpringConfig,
} from 'react-native-reanimated';

export { useReducedMotion } from 'react-native-reanimated';

/**
 * Motion tokens. Every animation in the app pulls its duration and curve from
 * here so the whole interface shares one rhythm.
 *
 * Micro-interactions sit in the 150-300ms band. Exits run at ~65% of their
 * enter duration — leaving feels quicker than arriving, which reads as
 * responsive rather than sluggish.
 */
export const duration = {
  instant: 120,
  fast: 180,
  base: 240,
  slow: 320,
} as const;

export const exitDuration = (enter: number) => Math.round(enter * 0.65);

/** Entering eases out (decelerates in); exiting eases in (accelerates away). */
export const easing = {
  enter: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.cubic),
  standard: Easing.inOut(Easing.quad),
};

/**
 * Spring presets. `press` is critically damped so a button never wobbles;
 * `entrance` carries a little weight; `bouncy` is reserved for toggles where
 * overshoot communicates the state flip.
 */
export const springs: Record<'press' | 'entrance' | 'bouncy' | 'snap', WithSpringConfig> = {
  press: { damping: 26, stiffness: 420, mass: 0.6, reduceMotion: ReduceMotion.System },
  entrance: { damping: 20, stiffness: 140, mass: 1, reduceMotion: ReduceMotion.System },
  bouncy: { damping: 14, stiffness: 220, mass: 0.8, reduceMotion: ReduceMotion.System },
  snap: { damping: 30, stiffness: 260, mass: 0.9, reduceMotion: ReduceMotion.System },
};

export const timings: Record<'enter' | 'exit' | 'fast' | 'loop', WithTimingConfig> = {
  enter: { duration: duration.base, easing: easing.enter, reduceMotion: ReduceMotion.System },
  exit: { duration: exitDuration(duration.base), easing: easing.exit, reduceMotion: ReduceMotion.System },
  fast: { duration: duration.fast, easing: easing.standard, reduceMotion: ReduceMotion.System },
  loop: { duration: 900, easing: easing.standard, reduceMotion: ReduceMotion.System },
};

/** Stagger step for list cascades — 30-50ms reads as one motion, not a queue. */
export const STAGGER_MS = 40;
/** Past this many items the cascade stops compounding, so row 30 isn't late. */
export const STAGGER_MAX_STEPS = 8;

export const staggerDelay = (index: number) =>
  Math.min(index, STAGGER_MAX_STEPS) * STAGGER_MS;

/** Press feedback: subtle scale within the 0.95-1.05 band, plus 1px of depth. */
export const PRESS_SCALE = 0.97;
export const PRESS_DEPTH = 1;
