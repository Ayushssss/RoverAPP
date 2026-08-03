import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import Animated, { FadeIn as RFadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  acquireSocket, releaseSocket, registerDevice, sendJoystick, sendCommand,
  onConnectionChange, onTelemetry, onBoards, type BoardInfo,
} from '../services/websocket';
import Joystick from '../components/Joystick';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { rem, spacing, radii, type, fonts } from '../theme';
import { duration } from '../motion';
import { haptics } from '../haptics';
import { Screen, IconButton, PulseDot } from '../components/ui';
import { useToast } from '../components/Toast';

type ControlRoute = RouteProp<RootStackParamList, 'Control'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'Control'>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function DPadButton({
  icon, onPress, onPressIn, onPressOut, tone, corner, label, active,
}: {
  icon: IconName;
  onPress?: () => void;
  /** Direction buttons drive on press and stop on release. */
  onPressIn?: () => void;
  onPressOut?: () => void;
  tone?: 'stop';
  corner?: 'top' | 'bottom' | 'left' | 'right';
  label: string;
  /** Held down — this direction is driving right now. */
  active?: boolean;
}) {
  const { theme } = useTheme();
  const stop = tone === 'stop';

  const radiusStyle = corner
    ? {
        top: { borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl },
        bottom: { borderBottomLeftRadius: radii.xl, borderBottomRightRadius: radii.xl },
        left: { borderTopLeftRadius: radii.xl, borderBottomLeftRadius: radii.xl },
        right: { borderTopRightRadius: radii.xl, borderBottomRightRadius: radii.xl },
      }[corner]
    : { borderRadius: radii.md };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      // No delay before the press registers. The default long-press window
      // would put a noticeable pause between the thumb landing and the rover
      // moving, which is the whole thing this control is judged on.
      unstable_pressDelay={0}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({
        width: rem(64),
        height: rem(64),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: stop
          ? theme.error + '55'
          : active ? 'transparent' : pressed ? theme.primary : theme.border,
        // A held direction stays filled, because "it is driving right now"
        // has to be readable at a glance — a press highlight that fades would
        // leave no way to tell a moving rover from a stopped one.
        backgroundColor: stop
          ? pressed ? theme.error : theme.errorDim
          : active ? theme.primary : pressed ? theme.primaryDim : theme.surface,
        ...radiusStyle,
      })}
    >
      {({ pressed }) => (
        <MaterialCommunityIcons
          name={icon}
          size={rem(stop ? 20 : 24)}
          color={
            stop
              ? pressed ? '#FFF7ED' : theme.errorTint
              : active ? theme.primaryOn : pressed ? theme.primaryTint : theme.textSecondary
          }
        />
      )}
    </Pressable>
  );
}

/**
 * Presentation for the readings a sensor hub sends. Unknown keys still show —
 * the wire format is an open map so a new sensor appears without a release,
 * and hiding what we don't recognise would defeat that.
 */
const SENSOR_LABELS: Record<string, { label: string; unit: string; digits: number }> = {
  tempC: { label: 'Temp', unit: '°C', digits: 1 },
  humidity: { label: 'Humidity', unit: '%', digits: 0 },
  heatIndexC: { label: 'Feels', unit: '°C', digits: 1 },
  soil: { label: 'Soil', unit: '%', digits: 0 },
  lux: { label: 'Light', unit: 'lx', digits: 0 },
  pressureHpa: { label: 'Pressure', unit: 'hPa', digits: 0 },
};

function SensorChip({ name, value }: { name: string; value: number }) {
  const { theme } = useTheme();
  const meta = SENSOR_LABELS[name];
  const label = meta?.label ?? name;
  const shown = meta ? value.toFixed(meta.digits) : String(Math.round(value * 100) / 100);

  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'baseline', gap: rem(4),
        paddingHorizontal: rem(spacing.md), paddingVertical: rem(6),
        borderRadius: radii.full,
        backgroundColor: theme.surface,
        borderWidth: 1, borderColor: theme.border,
      }}
    >
      <Text style={{ ...type.micro, color: theme.textMuted, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: fonts.mono, fontSize: rem(13), color: theme.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {shown}{meta?.unit ?? ''}
      </Text>
    </View>
  );
}

function Telemetry({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: 'center', minWidth: rem(62) }}>
      <Text style={{ ...type.micro, color: theme.textMuted, textTransform: 'uppercase' }}>{label}</Text>
      <Text
        style={{
          fontFamily: fonts.mono,
          fontSize: rem(15),
          color: theme.text,
          marginTop: rem(4),
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ControlScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<ControlRoute>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const { deviceName, macAddress } = route.params;
  const [connected, setConnected] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [lightOn, setLightOn] = useState(false);
  const [espIp, setEspIp] = useState<string | null>(null);
  const [readings, setReadings] = useState<Record<string, number>>({});
  /** Which D-pad direction is being held down, if any. */
  const [held, setHeld] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  /** Last stick vector, resent while held so the rover's failsafe stays fed. */
  const heading = useRef({ x: 0, y: 0 });

  const landscape = winW > winH;
  const joystickSize = Math.min(landscape ? winH * 0.62 : winW * 0.72, 300);
  const sensorHub = boards.some((b) => b.role === 'sensor');

  useEffect(() => {
    let mounted = true;
    // Tracks the live socket rather than latching once, so the badge can't
    // claim "Linked" after the relay has actually dropped.
    const unsubscribe = onConnectionChange((up) => { if (mounted) setConnected(up); });
    (async () => {
      try {
        await acquireSocket(user ? user.id : undefined);
        if (!mounted) return;
        setConnected(true);
        registerDevice(macAddress, (ip) => { if (mounted) setEspIp(ip); });
      } catch {
        if (mounted) setConnected(false);
      }
    })();

    // Readings merge rather than replace: a hub may report temperature and
    // humidity on one cadence and a slower sensor on another, and replacing
    // would make the slower values blink out between updates.
    const offTelemetry = onTelemetry(macAddress, (next) => {
      if (mounted) setReadings((prev) => ({ ...prev, ...next }));
    });
    const offBoards = onBoards(macAddress, (list) => { if (mounted) setBoards(list); });

    return () => {
      mounted = false;
      unsubscribe();
      offTelemetry();
      offBoards();
      releaseSocket();
    };
  }, [macAddress]);

  const handleMove = useCallback((x: number, y: number) => {
    // Taking the stick overrides a held direction — two things steering at
    // once would fight, and the stick is the more direct intent.
    setHeld(null);
    heading.current = { x, y };
    setCoords({ x, y });
    sendJoystick(macAddress, x, y);
  }, [macAddress]);

  /**
   * D-pad directions, as stick vectors at full deflection.
   *
   * Sent as joystick messages rather than the discrete `forward`/`left`
   * commands on purpose: the rover already treats a stick vector as a
   * continuous instruction, so latching becomes "keep sending this vector"
   * with no firmware change and no new message type.
   */
  const VECTORS: Record<string, { x: number; y: number }> = {
    forward: { x: 0, y: 1 },
    backward: { x: 0, y: -1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  /**
   * Drive while the button is held.
   *
   * Sent on press-down rather than on release, so the rover starts moving as
   * the thumb lands. Waiting for the release would put the entire duration of
   * the press between the intent and the movement.
   */
  const startDirection = useCallback((dir: string) => {
    const v = VECTORS[dir];
    const sent = sendJoystick(macAddress, v.x, v.y);
    if (!sent) {
      haptics.error();
      toast.error('Not linked — command not sent');
      return;
    }
    haptics.press();
    heading.current = v;
    setHeld(dir);
    setCoords(v);
  }, [macAddress, toast]);

  /**
   * Stop the moment the thumb lifts.
   *
   * Clearing `heading` first matters: the repeat tick fires every 250ms and
   * would otherwise re-send the direction just after the stop, driving on for
   * another second until the rover's failsafe caught it.
   */
  const endDirection = useCallback(() => {
    heading.current = { x: 0, y: 0 };
    setHeld(null);
    setCoords({ x: 0, y: 0 });
    sendCommand(macAddress, 'stop', 1);
  }, [macAddress]);

  /**
   * Keeps the rover's failsafe fed.
   *
   * Two cases need it. The stick only emits while the finger is actually
   * moving, so a held heading goes silent; and a held D-pad button sends
   * nothing after the initial press. Either way the rover would cut motors after
   * its 1s timeout. Repeating the current vector four times a second sits
   * comfortably inside that, and costs nothing when centred.
   */
  useEffect(() => {
    const id = setInterval(() => {
      const { x, y } = heading.current;
      if (x !== 0 || y !== 0) sendJoystick(macAddress, x, y);
    }, 250);
    return () => clearInterval(id);
  }, [macAddress]);

  const handleCommand = useCallback((cmd: string) => {
    // The headlight carries the state it is switching to, so the board can
    // follow the phone instead of keeping its own flag that drifts the first
    // time a command is dropped. The rest are one-shot actions.
    const value = cmd === 'light' ? (lightOn ? 0 : 1) : 1;
    const sent = sendCommand(macAddress, cmd, value);
    if (!sent) {
      haptics.error();
      toast.error('Not linked — command not sent');
      return;
    }
    if (cmd === 'stop') {
      // Clear the repeat and the latch too, or the rover would be told to
      // keep driving a quarter-second after being told to stop.
      heading.current = { x: 0, y: 0 };
      setHeld(null);
      setCoords({ x: 0, y: 0 });
    }
    if (cmd === 'light') setLightOn((p) => !p);
  }, [macAddress, toast, lightOn]);

  const stick = (
    <View style={{ alignItems: 'center', gap: rem(spacing.xl) }}>
      <Joystick size={joystickSize} onMove={handleMove} onRelease={() => handleCommand('stop')} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: rem(spacing.lg),
          paddingHorizontal: rem(spacing.xl),
          paddingVertical: rem(spacing.md),
          borderRadius: radii.xl,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Telemetry label="X" value={coords.x.toFixed(2)} />
        <View style={{ width: 1, height: rem(30), backgroundColor: theme.border }} />
        <Telemetry label="Y" value={coords.y.toFixed(2)} />
        <View style={{ width: 1, height: rem(30), backgroundColor: theme.border }} />
        <Telemetry label="Link" value={connected ? 'UP' : 'DOWN'} />
      </View>

      {/* Only rendered once a hub has actually reported something — an empty
          row of dashes would be worse than no row at all. */}
      {Object.keys(readings).length > 0 && (
        <View
          style={{
            flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
            gap: rem(spacing.sm), maxWidth: rem(320),
          }}
        >
          {Object.entries(readings).map(([name, value]) => (
            <SensorChip key={name} name={name} value={value} />
          ))}
        </View>
      )}

      {sensorHub && Object.keys(readings).length === 0 && (
        <Text style={{ ...type.caption, color: theme.textMuted }}>
          Sensor hub online — waiting for readings
        </Text>
      )}
    </View>
  );

  const dpad = (
    <View style={{ alignItems: 'center', gap: rem(spacing.md) }}>
      <Text style={{ ...type.micro, color: theme.textMuted, textTransform: 'uppercase' }}>
        {held ? 'Driving' : 'Hold to drive'}
      </Text>

      <View style={{ alignItems: 'center', gap: rem(4) }}>
        <DPadButton
          icon="chevron-up" corner="top" label="Forward"
          active={held === 'forward'}
          onPressIn={() => startDirection('forward')}
          onPressOut={endDirection}
        />
        <View style={{ flexDirection: 'row', gap: rem(4) }}>
          <DPadButton
            icon="chevron-left" corner="left" label="Left"
            active={held === 'left'}
            onPressIn={() => startDirection('left')}
            onPressOut={endDirection}
          />
          <DPadButton icon="square" tone="stop" label="Stop" onPress={() => handleCommand('stop')} />
          <DPadButton
            icon="chevron-right" corner="right" label="Right"
            active={held === 'right'}
            onPressIn={() => startDirection('right')}
            onPressOut={endDirection}
          />
        </View>
        <DPadButton
          icon="chevron-down" corner="bottom" label="Backward"
          active={held === 'backward'}
          onPressIn={() => startDirection('backward')}
          onPressOut={endDirection}
        />
      </View>
    </View>
  );

  return (
    <Screen wash={false} grid gridCell={rem(26)} gridStrength={0.75}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + rem(spacing.sm),
          paddingHorizontal: rem(spacing.xl),
          paddingBottom: rem(spacing.md),
          flexDirection: 'row',
          alignItems: 'center',
          gap: rem(spacing.md),
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        <IconButton icon="arrow-left" onPress={() => nav.goBack()} label="Go back" />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...type.heading, color: theme.text }} numberOfLines={1}>{deviceName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(4), marginTop: 1 }}>
            <PulseDot color={connected ? theme.successTint : theme.errorTint} size={rem(5)} halo={false} />
            <Text style={{ ...type.caption, color: connected ? theme.textDim : theme.errorTint }} numberOfLines={1}>
              {connected ? (espIp ? `Linked · ${espIp}` : 'Linked') : 'Reconnecting…'}
            </Text>
          </View>
        </View>

        <IconButton
          icon={lightOn ? 'lightbulb-on' : 'lightbulb-outline'}
          onPress={() => handleCommand('light')}
          active={lightOn}
          tint={theme.accent}
          label="Toggle headlight"
        />
        {/* Never disabled: the relay needs no LAN address, and gating on one
            is what left this button dead. The IP is passed when known so the
            camera screen can offer the faster local stream as well. */}
        <IconButton
          icon="video-outline"
          onPress={() => nav.navigate('Camera', {
            deviceName,
            macAddress,
            ip: espIp ?? undefined,
          })}
          label="Open camera"
        />
      </View>

      {/* Body */}
      <Animated.View
        entering={RFadeIn.duration(duration.base)}
        style={{
          flex: 1,
          paddingBottom: insets.bottom + rem(spacing.xl),
          ...(landscape
            ? { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: rem(spacing.xl) }
            : { justifyContent: 'space-evenly', alignItems: 'center' }),
        }}
      >
        {stick}
        {dpad}
      </Animated.View>
    </Screen>
  );
}
