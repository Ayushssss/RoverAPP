import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import Animated, { FadeIn as RFadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../motion';
import { rem, spacing, type } from '../theme';

/**
 * Web stand-in for the native Lottie check. lottie-react-native's web entry
 * requires a wasm player dependency that isn't worth shipping for a dev-only
 * surface, so Metro's platform resolution swaps this file in on web — same
 * exports, an SVG ring-and-check with a spring pop instead.
 */
export function SuccessCheck({ size = 120, onFinish }: { size?: number; onFinish?: () => void }) {
  const { theme } = useTheme();

  useEffect(() => {
    const t = setTimeout(() => onFinish?.(), 900);
    return () => clearTimeout(t);
  }, [onFinish]);

  return (
    <Animated.View entering={ZoomIn.springify().damping(14).stiffness(220)}>
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Circle cx={100} cy={100} r={78} stroke={theme.successTint} strokeWidth={10} fill="none" />
        <Polyline
          points="62,104 90,132 142,74"
          stroke={theme.successTint}
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

export function SuccessOverlay({
  visible, message, onDone,
}: {
  visible: boolean;
  message: string;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (visible && reduced) onDone();
  }, [visible, reduced]);

  if (!visible || reduced) return null;

  return (
    <Animated.View
      entering={RFadeIn.duration(160)}
      exiting={FadeOut.duration(180)}
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: theme.scrim,
        alignItems: 'center', justifyContent: 'center',
        gap: rem(spacing.lg),
        zIndex: 100,
      }}
    >
      <SuccessCheck size={rem(132)} onFinish={onDone} />
      <Text style={{ ...type.subheading, color: '#FFF7ED' }}>{message}</Text>
    </Animated.View>
  );
}
