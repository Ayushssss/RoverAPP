import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type, elevation } from '../theme';

/**
 * Connectivity is not binary for this app. A rover talks to the phone over the
 * local network, so "connected to WiFi but no route to the internet" is a
 * perfectly workable state — cloud sync pauses, driving still works. Saying
 * "You're offline" there would be wrong and would send people hunting for a
 * fault that isn't affecting them.
 */
export default function NetworkBanner() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const state = useNetworkState();

  // `isInternetReachable` is undefined until the first probe resolves. Treating
  // that as "offline" would flash a banner on every cold start.
  const noLink = state.isConnected === false;
  const noInternet = state.isConnected === true && state.isInternetReachable === false;

  if (!noLink && !noInternet) return null;

  const copy = noLink
    ? {
        icon: 'wifi-off' as const,
        title: 'No network',
        body: 'Reconnect to reach your rovers.',
        fg: theme.errorTint,
        bg: theme.errorDim,
      }
    : {
        icon: 'cloud-off-outline' as const,
        title: 'No internet',
        body: 'Local rover control still works; sync is paused.',
        fg: theme.accentTint,
        bg: theme.accentDim,
      };

  return (
    <Animated.View
      entering={SlideInUp.springify().damping(22).stiffness(180)}
      exiting={FadeOutUp.duration(180)}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        top: insets.top + rem(spacing.xs),
        left: rem(spacing.lg),
        right: rem(spacing.lg),
        flexDirection: 'row',
        alignItems: 'center',
        gap: rem(spacing.md),
        paddingVertical: rem(spacing.sm),
        paddingHorizontal: rem(spacing.md),
        borderRadius: radii.lg,
        backgroundColor: theme.surfaceElevated,
        borderWidth: 1,
        borderColor: theme.border,
        ...elevation(theme.shadow, 2),
      }}
    >
      <View
        style={{
          width: rem(26), height: rem(26), borderRadius: rem(13),
          backgroundColor: copy.bg, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <MaterialCommunityIcons name={copy.icon} size={rem(15)} color={copy.fg} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...type.caption, fontWeight: '700', color: theme.text }}>{copy.title}</Text>
        <Text style={{ fontSize: rem(11), color: theme.textDim }} numberOfLines={1}>
          {copy.body}
        </Text>
      </View>
    </Animated.View>
  );
}
