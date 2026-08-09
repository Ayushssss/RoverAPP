import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  acquireSocket, releaseSocket, registerDevice, onConnectionChange,
  onBoards, onCameraAvailable, onTelemetry, type BoardInfo,
} from '../services/websocket';
import { rem, spacing, radii, type, fonts } from '../theme';
import { Screen, ScreenHeader, Press, PulseDot, FadeIn } from '../components/ui';

type Route = RouteProp<RootStackParamList, 'RoverHub'>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const ROLE_LABEL: Record<BoardInfo['role'], { label: string; icon: IconName }> = {
  rover: { label: 'Drive board', icon: 'chip' },
  camera: { label: 'Camera', icon: 'camera-outline' },
  sensor: { label: 'Sensor hub', icon: 'thermometer' },
  controller: { label: 'Tilt controller', icon: 'gesture-tap-button' },
};

/**
 * What a rover *is*, before what it does.
 *
 * A rover is several ESP32s that happen to share a name — drive, camera,
 * sensor hub — each with its own connection. This page names them and their
 * state first, then offers the places you can actually go. Opening straight
 * into the joystick, as it used to, gave no way to tell a rover with no
 * camera from one whose camera is unplugged.
 */
export default function RoverHubScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<Route>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { deviceName, macAddress } = route.params;

  const [connected, setConnected] = useState(false);
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [hasCamera, setHasCamera] = useState(false);
  const [readings, setReadings] = useState<Record<string, number>>({});

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const offStatus = onConnectionChange((up) => { if (alive) setConnected(up); });
      const offBoards = onBoards(macAddress, (list) => { if (alive) setBoards(list); });
      const offCamera = onCameraAvailable(macAddress, (s) => { if (alive) setHasCamera(s.available); });
      const offTelemetry = onTelemetry(macAddress, (next) => {
        if (alive) setReadings((prev) => ({ ...prev, ...next }));
      });

      (async () => {
        try {
          await acquireSocket(user ? user.id : undefined);
          if (!alive) return;
          setConnected(true);
          registerDevice(macAddress);
        } catch {
          if (alive) setConnected(false);
        }
      })();

      return () => {
        alive = false;
        offStatus(); offBoards(); offCamera(); offTelemetry();
        releaseSocket();
      };
    }, [macAddress, user])
  );

  const sensorHub = boards.some((b) => b.role === 'sensor');
  const temp = readings.tempC;
  const humidity = readings.humidity;

  const destinations: {
    key: string;
    icon: IconName;
    title: string;
    body: string;
    tint: string;
    go: () => void;
    ready: boolean;
  }[] = [
    {
      key: 'drive',
      icon: 'gamepad-variant-outline',
      title: 'Drive',
      body: 'Joystick, D-pad and the headlight',
      tint: theme.primaryTint,
      go: () => nav.navigate('Control', { deviceId: deviceName, deviceName, macAddress }),
      ready: connected,
    },
    {
      key: 'sensors',
      icon: 'thermometer',
      title: 'Sensors',
      body: sensorHub
        ? temp !== undefined
          ? `${temp.toFixed(1)}°C · ${humidity?.toFixed(0) ?? '—'}% humidity`
          : 'Hub online — waiting for readings'
        : 'No sensor hub connected',
      tint: theme.successTint,
      go: () => nav.navigate('Sensors', { deviceName, macAddress }),
      ready: sensorHub,
    },
    {
      key: 'display',
      icon: 'card-text-outline',
      title: 'Display',
      body: sensorHub ? 'Write to the 16×2 panel' : 'Needs the sensor hub',
      tint: theme.accentTint,
      go: () => nav.navigate('Display', { deviceName, macAddress }),
      ready: sensorHub,
    },
    {
      key: 'camera',
      icon: 'video-outline',
      title: 'Camera',
      body: hasCamera ? 'Live view, from anywhere' : 'No camera connected',
      tint: theme.primaryTint,
      go: () => nav.navigate('Camera', { deviceName, macAddress }),
      ready: hasCamera,
    },
  ];

  return (
    <Screen grid gridCell={rem(26)} gridStrength={0.6}>
      <ScreenHeader title={deviceName} subtitle={macAddress} onBack={() => nav.goBack()} />

      <ScrollView
        contentContainerStyle={{
          padding: rem(spacing.xl),
          paddingBottom: insets.bottom + rem(spacing.xxl),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Link + board roster */}
        <View
          style={{
            padding: rem(spacing.lg),
            borderRadius: radii.xl,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            gap: rem(spacing.md),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(6) }}>
            <PulseDot color={connected ? theme.successTint : theme.errorTint} size={rem(5)} halo={false} />
            <Text style={{ ...type.caption, color: connected ? theme.textDim : theme.errorTint }}>
              {connected ? 'Relay linked' : 'Reconnecting…'}
            </Text>
          </View>

          {boards.length === 0 ? (
            <Text style={{ ...type.caption, color: theme.textMuted }}>
              No boards have reported in. Power the rover and check its serial
              monitor for a registration line.
            </Text>
          ) : (
            boards.map((b) => {
              const meta = ROLE_LABEL[b.role];
              return (
                <View key={b.mac} style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md) }}>
                  <View
                    style={{
                      width: rem(30), height: rem(30), borderRadius: radii.sm,
                      backgroundColor: theme.successTint + '1F',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons name={meta.icon} size={rem(15)} color={theme.successTint} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ ...type.bodyStrong, color: theme.text }}>{meta.label}</Text>
                    <Text
                      style={{ fontFamily: fonts.mono, fontSize: rem(10), color: theme.textMuted }}
                      numberOfLines={1}
                    >
                      {b.mac} · {b.ip}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Destinations */}
        <View style={{ gap: rem(spacing.md), marginTop: rem(spacing.xl) }}>
          {destinations.map((d, i) => (
            <FadeIn key={d.key} index={i}>
              <Press onPress={d.go} label={d.title}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: rem(spacing.md),
                    padding: rem(spacing.lg),
                    borderRadius: radii.xl,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <View
                    style={{
                      width: rem(40), height: rem(40), borderRadius: radii.md,
                      backgroundColor: d.tint + '1F',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons name={d.icon} size={rem(20)} color={d.tint} />
                  </View>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ ...type.subheading, color: theme.text }}>{d.title}</Text>
                    <Text style={{ ...type.caption, color: theme.textDim }} numberOfLines={1}>
                      {d.body}
                    </Text>
                  </View>

                  {/* Everything stays reachable even when its board is absent —
                      a page that explains what is missing beats a dead row. */}
                  {!d.ready && (
                    <View
                      style={{
                        paddingHorizontal: rem(8), paddingVertical: rem(3),
                        borderRadius: radii.full, backgroundColor: theme.bgSunken,
                      }}
                    >
                      <Text style={{ ...type.micro, color: theme.textMuted }}>OFFLINE</Text>
                    </View>
                  )}
                  <MaterialCommunityIcons name="chevron-right" size={rem(18)} color={theme.textMuted} />
                </View>
              </Press>
            </FadeIn>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
