import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { timings, useReducedMotion } from '../motion';

interface SkeletonProps {
  width: number | string;
  height: number;
  radius?: number;
  style?: any;
  /** Offsets the shimmer so stacked bars ripple instead of blinking in unison. */
  delay?: number;
}

/**
 * Shimmer animates `opacity` on the UI thread. Note it must never animate
 * `backgroundColor` through the core Animated API — the native driver only
 * handles transform and opacity, and driving a colour through it throws on
 * device while silently working on web.
 */
export function Skeleton({ width, height, radius = 8, style, delay = 0 }: SkeletonProps) {
  const { isDark } = useTheme();
  const shimmer = useSharedValue(0.5);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      shimmer.value = 0.7;
      return;
    }
    shimmer.value = withDelay(delay, withRepeat(withTiming(1, timings.loop), -1, true));
  }, [reduced, delay]);

  const animated = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: isDark ? 'rgba(255,247,237,0.12)' : 'rgba(61,35,20,0.12)',
        },
        animated,
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: any }) {
  const { theme } = useTheme();
  return (
    <View style={[{ backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 14 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Skeleton width={44} height={44} radius={12} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="60%" height={13} radius={6} delay={80} />
          <Skeleton width="40%" height={10} radius={5} delay={160} />
        </View>
        <Skeleton width={18} height={18} radius={9} delay={240} />
      </View>
    </View>
  );
}

export function SkeletonStatCard({ style }: { style?: any }) {
  const { theme } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 12 }, style]}>
      <Skeleton width={32} height={32} radius={10} style={{ marginBottom: 8 }} />
      <Skeleton width="70%" height={16} radius={6} style={{ marginBottom: 6 }} delay={80} />
      <Skeleton width="50%" height={10} radius={5} delay={160} />
    </View>
  );
}

export function SkeletonHeader({ style }: { style?: any }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="45%" height={22} radius={6} />
        <Skeleton width="30%" height={11} radius={5} delay={80} />
      </View>
      <Skeleton width={38} height={38} radius={11} delay={160} />
    </View>
  );
}
