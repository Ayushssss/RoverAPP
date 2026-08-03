import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  acquireSocket, releaseSocket, registerDevice, onConnectionChange,
  onBoards, onTelemetry, sendDisplay, type BoardInfo,
} from '../services/websocket';
import { rem, spacing, radii, type, fonts } from '../theme';
import { Screen, ScreenHeader, Field, Button, PulseDot } from '../components/ui';
import KeyboardAwareScroll from '../components/KeyboardAwareScroll';
import { useToast } from '../components/Toast';
import { haptics } from '../haptics';

type Route = RouteProp<RootStackParamList, 'Display'>;

/** The panel is 16 columns by 2 rows. Anything longer is simply not shown. */
const COLS = 16;

/**
 * A 16x2 character LCD, rendered as it will actually look.
 *
 * The preview matters more than it sounds: sixteen columns runs out fast, and
 * seeing the truncation before sending saves a round trip to the rover to find
 * out that "Temperature high" lost its last letter.
 */
function Panel({ line1, line2 }: { line1: string; line2: string }) {
  const { theme } = useTheme();
  // Classic backlit-LCD colours rather than palette roles — this is a picture
  // of a physical object, and it should read as one.
  const glass = '#132E1A';
  const ink = '#7CFFB2';

  const row = (text: string, key: string) => (
    <View key={key} style={{ flexDirection: 'row' }}>
      {Array.from({ length: COLS }).map((_, i) => (
        <Text
          key={i}
          style={{
            fontFamily: fonts.mono,
            fontSize: rem(15),
            lineHeight: rem(22),
            color: ink,
            width: rem(13),
            textAlign: 'center',
            opacity: text[i] ? 1 : 0.12,
          }}
        >
          {text[i] ?? '·'}
        </Text>
      ))}
    </View>
  );

  return (
    <View
      style={{
        alignSelf: 'center',
        padding: rem(spacing.md),
        borderRadius: radii.md,
        backgroundColor: glass,
        borderWidth: 2,
        borderColor: theme.borderStrong,
      }}
    >
      {row(line1.slice(0, COLS), 'l1')}
      {row(line2.slice(0, COLS), 'l2')}
    </View>
  );
}

export default function DisplayScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<Route>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { deviceName, macAddress } = route.params;

  const [connected, setConnected] = useState(false);
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [readings, setReadings] = useState<Record<string, number>>({});
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const offStatus = onConnectionChange((up) => { if (alive) setConnected(up); });
      const offBoards = onBoards(macAddress, (list) => { if (alive) setBoards(list); });
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
        offStatus(); offBoards(); offTelemetry();
        releaseSocket();
      };
    }, [macAddress, user])
  );

  const hub = boards.find((b) => b.role === 'sensor');

  const [sending, setSending] = useState(false);

  const push = async (a: string, b: string) => {
    setSending(true);
    const delivered = await sendDisplay(macAddress, a, b);
    setSending(false);

    if (!delivered) {
      haptics.error();
      // The two ways this fails look identical from the panel, so name them.
      toast.error(
        connected
          ? 'No board took it — is the sensor hub online?'
          : 'Not linked — nothing sent'
      );
      return;
    }
    haptics.success();
    toast.success('Sent to the panel');
  };

  const send = () => push(line1, line2);

  /**
   * Shortcuts worth having on a rover you are standing away from. The reading
   * ones use whatever the hub last reported, so they say something true or
   * they say nothing.
   */
  const presets: { label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; run: () => void }[] = [
    {
      label: 'Readings',
      icon: 'thermometer',
      run: () => {
        const t = readings.tempC;
        const h = readings.humidity;
        if (t === undefined || h === undefined) {
          toast.show('No readings yet', { tone: 'info' });
          return;
        }
        push(`T ${t.toFixed(1)}C H ${h.toFixed(0)}%`, 'Live from hub');
      },
    },
    { label: 'Name', icon: 'rename-box', run: () => push(deviceName.slice(0, COLS), 'AgriVerse Rover') },
    { label: 'Warning', icon: 'alert-outline', run: () => push('!! KEEP CLEAR !!', 'Rover is active') },
    { label: 'Clear', icon: 'eraser', run: () => { setLine1(''); setLine2(''); push('', ''); } },
  ];

  return (
    <Screen grid gridCell={rem(26)} gridStrength={0.6}>
      <ScreenHeader title="Display" subtitle={deviceName} onBack={() => nav.goBack()} />

      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: rem(6),
          paddingHorizontal: rem(spacing.xl), paddingTop: rem(spacing.md),
        }}
      >
        <PulseDot
          color={connected && hub ? theme.successTint : theme.errorTint}
          size={rem(5)}
          halo={false}
        />
        <Text style={{ ...type.caption, color: theme.textDim }}>
          {!connected ? 'Reconnecting…' : hub ? '16×2 panel ready' : 'No sensor hub connected'}
        </Text>
      </View>

      <KeyboardAwareScroll
        contentContainerStyle={{
          padding: rem(spacing.xl),
          paddingBottom: insets.bottom + rem(spacing.xxl),
        }}
      >
        <Panel line1={line1} line2={line2} />

        <View style={{ gap: rem(18), marginTop: rem(spacing.xl) }}>
          <Field
            label="Line 1"
            value={line1}
            onChangeText={setLine1}
            placeholder="AgriVerse Rover"
            maxLength={COLS}
            mono
            hint={`${line1.length}/${COLS}`}
          />
          <Field
            label="Line 2"
            value={line2}
            onChangeText={setLine2}
            placeholder="Field 3 · row 12"
            maxLength={COLS}
            mono
            hint={`${line2.length}/${COLS}`}
          />
        </View>

        <Button
          label="Send to panel"
          icon="send"
          onPress={send}
          loading={sending}
          disabled={!connected}
          style={{ marginTop: rem(spacing.xl) }}
        />

        <Text style={{ ...type.micro, color: theme.textDim, textTransform: 'uppercase', marginTop: rem(spacing.xxl) }}>
          Shortcuts
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: rem(spacing.sm), marginTop: rem(spacing.md) }}>
          {presets.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => { haptics.tap(); p.run(); }}
              accessibilityRole="button"
              accessibilityLabel={p.label}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: rem(6),
                paddingVertical: rem(9), paddingHorizontal: rem(spacing.md),
                borderRadius: radii.full,
                backgroundColor: theme.surface,
                borderWidth: 1, borderColor: theme.border,
              }}
            >
              <MaterialCommunityIcons name={p.icon} size={rem(14)} color={theme.textDim} />
              <Text style={{ fontSize: rem(12), fontWeight: '600', color: theme.textSecondary }}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ ...type.caption, color: theme.textMuted, marginTop: rem(spacing.xl) }}>
          Text holds on the panel for about eight seconds, then the hub goes back
          to showing its own readings. Sent to every board on the rover — only the
          one with a display acts on it.
        </Text>
      </KeyboardAwareScroll>
    </Screen>
  );
}
