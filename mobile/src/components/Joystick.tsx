import React, { useRef, useEffect } from 'react';
import { View, PanResponder, StyleSheet, Dimensions, Animated, Platform } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Line, G } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

const SIZE = Math.min(Dimensions.get('window').width * 0.72, 290);
const KNOB_SIZE = 60;
const DEAD_ZONE = 0.06;

interface JoystickProps { onMove: (x: number, y: number) => void; onRelease?: () => void; }

export default function Joystick({ onMove, onRelease }: JoystickProps) {
  const { theme } = useTheme();
  const knobPos = useRef({ x: 0, y: 0 });
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [, forceUpdate] = React.useState(0);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.92, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => forceUpdate(n => n + 1),
    onPanResponderMove: (_, gesture) => {
      const radius = SIZE / 2 - KNOB_SIZE / 2;
      let dx = gesture.moveX - gesture.x0;
      let dy = gesture.moveY - gesture.y0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) { dx = (dx / dist) * radius; dy = (dy / dist) * radius; }
      knobPos.current = { x: dx, y: dy };
      const nx = Math.max(-1, Math.min(1, dx / radius));
      const ny = Math.max(-1, Math.min(1, -dy / radius));
      if (Math.abs(nx) > DEAD_ZONE || Math.abs(ny) > DEAD_ZONE) onMove(nx, ny);
      else onMove(0, 0);
      forceUpdate(n => n + 1);
    },
    onPanResponderRelease: () => {
      knobPos.current = { x: 0, y: 0 }; onMove(0, 0); onRelease?.(); forceUpdate(n => n + 1);
    },
  })).current;

  const cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2 - 2;

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: pulseAnim }] }]} {...panResponder.panHandlers}>
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <RadialGradient id="outerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={theme.primary} stopOpacity="0.2" />
            <Stop offset="70%" stopColor={theme.primary} stopOpacity="0.05" />
            <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="knobGrad" cx="40%" cy="35%" r="60%">
            <Stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
            <Stop offset="40%" stopColor={theme.primary} stopOpacity="0.6" />
            <Stop offset="100%" stopColor={theme.surfaceElevated} stopOpacity="0.8" />
          </RadialGradient>
          <RadialGradient id="innerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={theme.primary} stopOpacity="0.15" />
            <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.border} strokeWidth={1.5} />
        <Circle cx={cx} cy={cy} r={r + 10} fill="url(#outerGlow)" />

        <Circle cx={cx} cy={cy} r={20} fill="url(#innerGlow)" />
        <Line x1={cx - SIZE / 3.5} y1={cy} x2={cx + SIZE / 3.5} y2={cy} stroke={theme.border} strokeWidth={0.8} strokeOpacity={0.5} />
        <Line x1={cx} y1={cy - SIZE / 3.5} x2={cx} y2={cy + SIZE / 3.5} stroke={theme.border} strokeWidth={0.8} strokeOpacity={0.5} />

        <Circle cx={cx} cy={cy} r={4} fill={theme.textMuted} />

        <G x={knobPos.current.x} y={knobPos.current.y}>
          <Circle cx={cx} cy={cy} r={KNOB_SIZE / 2 + 4} fill={theme.primary + '10'} />
          <Circle cx={cx} cy={cy} r={KNOB_SIZE / 2} fill="url(#knobGrad)" stroke={theme.primary} strokeWidth={1.5} />
          <Circle cx={cx - 3} cy={cy - 3} r={KNOB_SIZE / 5} fill="rgba(255,255,255,0.15)" />
        </G>
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: SIZE, height: SIZE, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' },
});
