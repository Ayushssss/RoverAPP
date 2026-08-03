import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Polyline } from 'react-native-svg';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  acquireSocket, releaseSocket, registerDevice, onConnectionChange,
  onTelemetry, onBoards, type BoardInfo,
} from '../services/websocket';
import { rem, spacing, radii, type, fonts } from '../theme';
import { Screen, ScreenHeader, PulseDot, EmptyState } from '../components/ui';
import { relativeTime } from '../utils/time';

type Route = RouteProp<RootStackParamList, 'Sensors'>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Presentation for readings we recognise. Anything else still shows, raw. */
const META: Record<string, { label: string; unit: string; digits: number; icon: IconName }> = {
  tempC: { label: 'Temperature', unit: '°C', digits: 1, icon: 'thermometer' },
  humidity: { label: 'Humidity', unit: '%', digits: 0, icon: 'water-percent' },
  heatIndexC: { label: 'Feels like', unit: '°C', digits: 1, icon: 'sun-thermometer-outline' },
  soil: { label: 'Soil moisture', unit: '%', digits: 0, icon: 'sprout-outline' },
  lux: { label: 'Light', unit: 'lx', digits: 0, icon: 'white-balance-sunny' },
  pressureHpa: { label: 'Pressure', unit: 'hPa', digits: 0, icon: 'gauge' },
};

/** Points kept per reading. At one sample every 3s this is about six minutes. */
const HISTORY = 120;

/**
 * Sparkline over the samples received while this screen has been open.
 *
 * Deliberately session-only: nothing is stored, so the line can never imply
 * history the app does not actually have. It fills in as readings arrive.
 */
function Spark({ points, tint }: { points: number[]; tint: string }) {
  const { theme } = useTheme();
  const w = 100;
  const h = 28;

  if (points.length < 2) {
    return <View style={{ height: rem(h) }} />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  // A flat line would otherwise divide by zero and collapse to the top edge.
  const span = max - min || 1;
  const step = w / (points.length - 1);

  const path = points
    .map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / span) * h).toFixed(2)}`)
    .join(' ');

  return (
    <View style={{ height: rem(h) }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <Polyline
          points={path}
          fill="none"
          stroke={tint}
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
      <Text style={{ ...type.micro, color: theme.textMuted, marginTop: rem(2) }}>
        {min.toFixed(1)} – {max.toFixed(1)} this session
      </Text>
    </View>
  );
}

export default function SensorsScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<Route>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { deviceName, macAddress } = route.params;

  const [connected, setConnected] = useState(false);
  const [readings, setReadings] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  /** Rendered every second so "12s ago" stays honest without a reading. */
  const [, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const offStatus = onConnectionChange((up) => { if (alive) setConnected(up); });
      const offBoards = onBoards(macAddress, (list) => { if (alive) setBoards(list); });
      const offTelemetry = onTelemetry(macAddress, (next) => {
        if (!alive) return;
        setReadings((prev) => ({ ...prev, ...next }));
        setHistory((prev) => {
          const merged = { ...prev };
          for (const [key, value] of Object.entries(next)) {
            merged[key] = [...(merged[key] ?? []), value].slice(-HISTORY);
          }
          return merged;
        });
        setUpdatedAt(new Date().toISOString());
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

      timer.current = setInterval(() => setTick((t) => t + 1), 1000);

      return () => {
        alive = false;
        offStatus(); offBoards(); offTelemetry();
        if (timer.current) clearInterval(timer.current);
        releaseSocket();
      };
    }, [macAddress, user])
  );

  const hub = boards.find((b) => b.role === 'sensor');
  const keys = Object.keys(readings);

  return (
    <Screen grid gridCell={rem(26)} gridStrength={0.6}>
      <ScreenHeader
        title="Sensors"
        subtitle={deviceName}
        onBack={() => nav.goBack()}
      />

      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: rem(6),
          paddingHorizontal: rem(spacing.xl), paddingTop: rem(spacing.md),
        }}
      >
        <PulseDot color={connected ? theme.successTint : theme.errorTint} size={rem(5)} halo={false} />
        <Text style={{ ...type.caption, color: theme.textDim }}>
          {!connected
            ? 'Reconnecting…'
            : hub
              ? updatedAt
                ? `Updated ${relativeTime(updatedAt)}`
                : 'Hub online — waiting for readings'
              : 'No sensor hub connected'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: rem(spacing.xl),
          paddingBottom: insets.bottom + rem(spacing.xxl),
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        {keys.length === 0 ? (
          <EmptyState
            art={<MaterialCommunityIcons name="thermometer-off" size={rem(56)} color={theme.textMuted} />}
            title={hub ? 'No readings yet' : 'No sensor hub'}
            body={
              hub
                ? 'The hub is on the relay but has not sent a reading. A DHT11 needs a few seconds after power-up, and failed reads are skipped rather than shown as zero.'
                : 'Flash sensor_hub.ino to a second ESP32 and set ROVER_MAC to this rover. It will appear here on its own.'
            }
          />
        ) : (
          <View style={{ gap: rem(spacing.md) }}>
            {keys.map((key) => {
              const meta = META[key];
              const value = readings[key];
              const points = history[key] ?? [];
              return (
                <View
                  key={key}
                  style={{
                    padding: rem(spacing.lg),
                    borderRadius: radii.xl,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md) }}>
                    <View
                      style={{
                        width: rem(36), height: rem(36), borderRadius: radii.md,
                        backgroundColor: theme.primaryTint + '1F',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <MaterialCommunityIcons
                        name={meta?.icon ?? 'chart-line'}
                        size={rem(18)}
                        color={theme.primaryTint}
                      />
                    </View>

                    <Text style={{ ...type.body, color: theme.textDim, flex: 1 }}>
                      {meta?.label ?? key}
                    </Text>

                    <Text
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: rem(24),
                        color: theme.text,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {meta ? value.toFixed(meta.digits) : String(Math.round(value * 100) / 100)}
                      <Text style={{ fontSize: rem(13), color: theme.textDim }}>{meta?.unit ?? ''}</Text>
                    </Text>
                  </View>

                  <View style={{ marginTop: rem(spacing.md) }}>
                    <Spark points={points} tint={theme.primaryTint} />
                  </View>
                </View>
              );
            })}

            {!!hub && (
              <Text style={{ ...type.caption, color: theme.textMuted, marginTop: rem(spacing.sm) }}>
                Reported by {hub.mac} at {hub.ip}. Readings are live only — nothing
                is stored, so the trace starts fresh each time you open this page.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
