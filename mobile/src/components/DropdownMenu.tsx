import React, { useState, useEffect } from 'react';
import { View, Text, Modal, Pressable, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, interpolate,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type, elevation } from '../theme';
import { springs, timings } from '../motion';
import Glass from './Glass';

const GROUPS = [
  [
    { label: 'Dashboard', icon: 'view-dashboard-outline', screen: 'Home' },
    { label: 'Rovers', icon: 'robot-outline', screen: 'Rovers' },
  ],
  [
    { label: 'Add rover', icon: 'plus-circle-outline', screen: 'AddDevice' },
    { label: 'Clusters', icon: 'sitemap-outline', screen: 'Clusters' },
  ],
  [
    { label: 'Profile', icon: 'account-outline', screen: 'Profile' },
    { label: 'Settings', icon: 'cog-outline', screen: 'Settings' },
  ],
] as const;

export default function DropdownMenu() {
  const [open, setOpen] = useState(false);
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();

  const progress = useSharedValue(0);

  useEffect(() => {
    if (open) {
      progress.value = withSpring(1, springs.snap);
    } else {
      progress.value = withTiming(0, timings.exit);
    }
  }, [open]);

  // Grows from the top-right corner, where the trigger sits, so the panel
  // reads as coming out of the button rather than appearing from nowhere.
  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [-14, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.92, 1]) },
    ],
  }));

  const go = (screen: string) => {
    setOpen(false);
    setTimeout(() => {
      try { nav.navigate(screen as never); } catch {}
    }, 180);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        hitSlop={10}
        style={{
          width: 38, height: 38, borderRadius: radii.md,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: theme.surface,
          borderWidth: 1, borderColor: theme.border,
        }}
      >
        <MaterialCommunityIcons name="menu" size={rem(19)} color={theme.text} />
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: insets.top + rem(54),
                right: rem(spacing.lg),
                width: Math.min(winW - rem(spacing.xxl), rem(264)),
                transformOrigin: 'top right',
                ...elevation(theme.shadow, 3),
              },
              panelStyle,
            ]}
          >
            <Glass radius={radii.xxl} style={{ paddingVertical: rem(6) }}>
            {GROUPS.map((group, gi) => (
              <View key={gi}>
                {gi > 0 && (
                  <View style={{ height: 1, backgroundColor: theme.border, marginVertical: rem(5), marginHorizontal: rem(spacing.lg) }} />
                )}
                {group.map((item) => (
                  <Pressable
                    key={item.screen}
                    onPress={() => go(item.screen)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: rem(spacing.md),
                      paddingVertical: rem(12),
                      paddingHorizontal: rem(spacing.lg),
                      backgroundColor: pressed ? theme.primaryDim : 'transparent',
                    })}
                  >
                    <MaterialCommunityIcons name={item.icon} size={rem(18)} color={theme.textDim} />
                    <Text style={{ ...type.body, fontWeight: '500', color: theme.text }}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            </Glass>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}
