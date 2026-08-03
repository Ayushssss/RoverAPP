import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type } from '../theme';
import { Screen, Button, Press, FadeIn, Badge } from '../components/ui';
import Rover3D from '../components/Rover3D';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Intro'>;

const FEATURES = [
  { icon: 'access-point', title: 'Direct WebSocket control', body: 'Commands reach the ESP32 without a round trip through the cloud.' },
  { icon: 'sitemap-outline', title: 'Cluster management', body: 'Group rovers by field, block or crop and address them together.' },
  { icon: 'timer-sand', title: 'Sub-100ms latency', body: 'Joystick input streams continuously while the stick is held.' },
] as const;

export default function IntroScreen() {
  const nav = useNavigation<Nav>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const compact = winH < 720;

  return (
    <Screen>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + rem(compact ? spacing.xl : spacing.xxxl),
          paddingBottom: insets.bottom + rem(spacing.xl),
          paddingHorizontal: rem(spacing.xl),
        }}
      >
        <FadeIn index={0} style={{ alignItems: 'flex-start' }}>
          {/* 3D on native; SVG mark on web and under reduced motion. */}
          <Rover3D size={rem(compact ? 140 : 172)} />
        </FadeIn>

        <FadeIn index={1} style={{ marginTop: rem(spacing.xl) }}>
          <Badge label="AGRIVERSE" />
          <Text style={{ ...type.display, color: theme.text, marginTop: rem(spacing.md) }}>
            Rover Control
          </Text>
          <Text
            style={{
              ...type.body,
              color: theme.textDim,
              marginTop: rem(spacing.sm),
              maxWidth: rem(300),
            }}
          >
            The command console for your ESP32 field fleet — pair a rover, take
            the stick, watch the row.
          </Text>
        </FadeIn>

        <View style={{ flex: 1, justifyContent: 'center', gap: rem(compact ? spacing.md : spacing.lg), paddingVertical: rem(spacing.xl) }}>
          {FEATURES.map((f, i) => (
            <FadeIn key={f.title} index={2 + i}>
              <View style={{ flexDirection: 'row', gap: rem(spacing.lg), alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: rem(38), height: rem(38), borderRadius: radii.md,
                    backgroundColor: theme.primaryDim,
                    alignItems: 'center', justifyContent: 'center',
                    marginTop: 2,
                  }}
                >
                  <MaterialCommunityIcons name={f.icon} size={rem(19)} color={theme.primaryTint} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ ...type.bodyStrong, color: theme.text }}>{f.title}</Text>
                  {!compact && (
                    <Text style={{ ...type.caption, color: theme.textDim, marginTop: 2 }}>{f.body}</Text>
                  )}
                </View>
              </View>
            </FadeIn>
          ))}
        </View>

        <FadeIn index={5} style={{ gap: rem(spacing.lg) }}>
          <Button label="Get started" onPress={() => nav.navigate('Login')} />
          <Press onPress={() => nav.navigate('Signup')} label="Create an account" style={{ alignSelf: 'center' }}>
            <Text style={{ ...type.caption, color: theme.textDim, paddingVertical: rem(spacing.sm) }}>
              No account yet?{' '}
              <Text style={{ color: theme.primaryTint, fontWeight: '700' }}>Create one</Text>
            </Text>
          </Press>
        </FadeIn>
      </View>
    </Screen>
  );
}
