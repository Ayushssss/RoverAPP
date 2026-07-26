import React, { useEffect, useRef } from 'react';
import { Animated, View, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface SkeletonProps {
  width: number | string;
  height: number;
  radius?: number;
  style?: any;
}

export function Skeleton({ width, height, radius = 8, style }: SkeletonProps) {
  const { isDark } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: isDark
      ? ['rgba(255,247,237,0.05)', 'rgba(255,247,237,0.12)']
      : ['rgba(61,35,20,0.05)', 'rgba(61,35,20,0.12)'],
  });

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius: radius, backgroundColor: bg }, style]}
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
          <Skeleton width="60%" height={13} radius={6} />
          <Skeleton width="40%" height={10} radius={5} />
        </View>
        <Skeleton width={18} height={18} radius={9} />
      </View>
    </View>
  );
}

export function SkeletonStatCard({ style }: { style?: any }) {
  const { theme } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 12 }, style]}>
      <Skeleton width={32} height={32} radius={10} style={{ marginBottom: 8 }} />
      <Skeleton width="70%" height={16} radius={6} style={{ marginBottom: 6 }} />
      <Skeleton width="50%" height={10} radius={5} />
    </View>
  );
}

export function SkeletonHeader({ style }: { style?: any }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="45%" height={22} radius={6} />
        <Skeleton width="30%" height={11} radius={5} />
      </View>
      <Skeleton width={38} height={38} radius={11} />
    </View>
  );
}
