import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withRepeat,
  interpolate, runOnJS, Extrapolation,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Defs, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { springs, timings, useReducedMotion } from '../motion';

const DEAD_ZONE = 0.06;
/** Emit at ~25Hz. 60Hz floods both the websocket and the React render loop. */
const EMIT_INTERVAL_MS = 40;

interface JoystickProps {
  onMove: (x: number, y: number) => void;
  onRelease?: () => void;
  size?: number;
}

/**
 * Relative analog stick: the knob tracks the drag delta from wherever the
 * finger landed, so grabbing the edge of the pad doesn't snap the rover.
 *
 * Tracking runs entirely in a worklet on the UI thread — the knob keeps up at
 * 60fps even while JS is blocked fetching or reconnecting the socket. Only the
 * throttled coordinate emit crosses back to JS.
 */
function Joystick({ onMove, onRelease, size }: JoystickProps) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();

  const SIZE = size ?? Math.min(Dimensions.get('window').width * 0.72, 290);
  const KNOB = Math.round(SIZE * 0.23);
  const RADIUS = SIZE / 2 - KNOB / 2;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const active = useSharedValue(0);
  const idle = useSharedValue(1);
  const lastEmit = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      idle.value = 0.6;
      return;
    }
    idle.value = withRepeat(withTiming(0.35, { ...timings.loop, duration: 1800 }), -1, true);
  }, [reduced]);

  const emit = useCallback((x: number, y: number) => onMove(x, y), [onMove]);
  const finish = useCallback(() => {
    onMove(0, 0);
    onRelease?.();
  }, [onMove, onRelease]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          active.value = withSpring(1, springs.press);
        })
        .onUpdate((e) => {
          let dx = e.translationX;
          let dy = e.translationY;

          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > RADIUS) {
            dx = (dx / dist) * RADIUS;
            dy = (dy / dist) * RADIUS;
          }
          tx.value = dx;
          ty.value = dy;

          let nx = Math.max(-1, Math.min(1, dx / RADIUS));
          let ny = Math.max(-1, Math.min(1, -dy / RADIUS));
          if (Math.abs(nx) <= DEAD_ZONE && Math.abs(ny) <= DEAD_ZONE) {
            nx = 0;
            ny = 0;
          }

          const now = Date.now();
          if (now - lastEmit.value >= EMIT_INTERVAL_MS) {
            lastEmit.value = now;
            runOnJS(emit)(nx, ny);
          }
        })
        .onFinalize(() => {
          tx.value = withSpring(0, springs.snap);
          ty.value = withSpring(0, springs.snap);
          active.value = withSpring(0, springs.press);
          lastEmit.value = 0;
          runOnJS(finish)();
        }),
    [RADIUS, emit, finish]
  );

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: interpolate(active.value, [0, 1], [1, 1.08], Extrapolation.CLAMP) },
    ],
  }));

  // The idle breath stops the moment you grab the stick — it signals "ready",
  // and a control that keeps breathing while in use reads as noise.
  const ringStyle = useAnimatedStyle(() => ({
    opacity: idle.value * (1 - active.value),
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: interpolate(idle.value, [0.35, 1], [1.15, 0.95], Extrapolation.CLAMP) },
    ],
  }));

  const c = SIZE / 2;
  const plateR = SIZE / 2 - 2;
  const tick = SIZE / 3.4;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id="plate" cx="50%" cy="45%" r="55%">
              <Stop offset="0%" stopColor={theme.primaryTint} stopOpacity="0.10" />
              <Stop offset="70%" stopColor={theme.primaryTint} stopOpacity="0.03" />
              <Stop offset="100%" stopColor={theme.primaryTint} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          <Circle cx={c} cy={c} r={plateR} fill="url(#plate)" />
          <Circle cx={c} cy={c} r={plateR} fill="none" stroke={theme.border} strokeWidth={1.5} />
          <Circle cx={c} cy={c} r={plateR * 0.62} fill="none" stroke={theme.border} strokeWidth={1} strokeDasharray="3 7" />

          <Line x1={c - tick} y1={c} x2={c - tick * 0.72} y2={c} stroke={theme.textMuted} strokeWidth={1.5} strokeLinecap="round" />
          <Line x1={c + tick * 0.72} y1={c} x2={c + tick} y2={c} stroke={theme.textMuted} strokeWidth={1.5} strokeLinecap="round" />
          <Line x1={c} y1={c - tick} x2={c} y2={c - tick * 0.72} stroke={theme.textMuted} strokeWidth={1.5} strokeLinecap="round" />
          <Line x1={c} y1={c + tick * 0.72} x2={c} y2={c + tick} stroke={theme.textMuted} strokeWidth={1.5} strokeLinecap="round" />
        </Svg>

        <Animated.View
          style={[
            {
              pointerEvents: 'none',
              position: 'absolute',
              width: KNOB * 1.6,
              height: KNOB * 1.6,
              borderRadius: KNOB * 0.8,
              borderWidth: 1,
              borderColor: theme.primaryTint,
            },
            ringStyle,
          ]}
        />

        <Animated.View
          style={[
            {
              pointerEvents: 'none',
              position: 'absolute',
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              overflow: 'hidden',
              borderWidth: 1.5,
              borderColor: theme.accent,
            },
            knobStyle,
          ]}
        >
          <LinearGradient
            colors={['#D9683C', '#A6482A']}
            start={{ x: 0.25, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View
              style={{
                width: KNOB * 0.26,
                height: KNOB * 0.26,
                borderRadius: KNOB * 0.13,
                backgroundColor: 'rgba(255,247,237,0.55)',
              }}
            />
          </LinearGradient>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export default React.memo(Joystick);
