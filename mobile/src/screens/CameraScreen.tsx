import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, ActivityIndicator, StatusBar, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  acquireSocket, releaseSocket, registerDevice,
  startCamera, stopCamera, onCameraFrame, onCameraError, onCameraAvailable,
} from '../services/websocket';
import { rem, spacing, radii, type, fonts } from '../theme';
import { Screen, IconButton, PulseDot, Button } from '../components/ui';
import { SignalArt } from '../components/Illustrations';
import { haptics } from '../haptics';

type CameraRoute = RouteProp<RootStackParamList, 'Camera'>;

/**
 * `relay` routes frames through the server, so it works from anywhere at the
 * cost of latency. `lan` pulls MJPEG straight off the camera and is far
 * smoother, but only when the phone is on the rover's network.
 */
type Source = 'relay' | 'lan';

export default function CameraScreen() {
  const nav = useNavigation();
  const route = useRoute<CameraRoute>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { deviceName, macAddress } = route.params;

  const [lanIp, setLanIp] = useState<string | null>(route.params.ip ?? null);
  const [source, setSource] = useState<Source>(route.params.ip ? 'lan' : 'relay');
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lanLoading, setLanLoading] = useState(true);
  const [fps, setFps] = useState(0);

  /** Frame arrival times, for the on-screen rate. */
  const ticks = useRef<number[]>([]);
  /** When the last frame landed, so a stalled stream can be told from a slow one. */
  const lastFrameAt = useRef<number>(0);
  const [stalled, setStalled] = useState(false);

  const streamUrl = lanIp ? `http://${lanIp}:81/stream` : null;

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          await acquireSocket(user ? user.id : undefined);
          if (!alive) return;
          registerDevice(macAddress);
        } catch {
          if (alive) setError('Could not reach the relay');
        }
      })();
      return () => { alive = false; releaseSocket(); };
    }, [macAddress, user])
  );

  // Frames land here whether or not this screen asked for them yet; the
  // subscription is cheap and starting it early avoids missing the first one.
  useEffect(() => {
    const offFrame = onCameraFrame((jpeg) => {
      setFrame(jpeg);
      setError(null);
      setStalled(false);

      const now = Date.now();
      lastFrameAt.current = now;
      ticks.current.push(now);
      // Keep only the last second of arrivals — the rate then reads as
      // "frames in the last second", which is what fps means to a viewer.
      while (ticks.current.length && now - ticks.current[0] > 1000) ticks.current.shift();
      setFps(ticks.current.length);
    });
    const offError = onCameraError((message) => setError(message));
    const offAvail = onCameraAvailable(macAddress, (status) => {
      if (status.ip) setLanIp(status.ip);
      if (!status.available) setError('Camera is not connected');
    });
    return () => { offFrame(); offError(); offAvail(); };
  }, [macAddress]);

  // Only ask for frames while the relay view is actually on screen. The
  // server switches the camera off when the last viewer leaves, so leaving
  // this running would keep the rover encoding video into an empty room.
  useFocusEffect(
    useCallback(() => {
      if (source !== 'relay') return;
      startCamera(macAddress);
      lastFrameAt.current = Date.now();

      /*
        A stream that stops mid-flight looks exactly like one still loading —
        which is how this screen ends up sitting on a spinner forever while
        the camera has actually dropped off. Anything past 4s without a frame
        is treated as stalled, and the fps counter is zeroed so the header
        stops advertising a rate that is no longer real.
      */
      const watchdog = setInterval(() => {
        const quiet = Date.now() - lastFrameAt.current;
        if (quiet > 4000) {
          setStalled(true);
          setFps(0);
          ticks.current = [];
        }
      }, 1000);

      return () => {
        clearInterval(watchdog);
        stopCamera(macAddress);
        setFrame(null);
        ticks.current = [];
        setFps(0);
        setStalled(false);
      };
    }, [macAddress, source])
  );

  const retry = () => {
    haptics.tap();
    setError(null);
    setStalled(false);
    setAttempt((a) => a + 1);
    if (source === 'relay') {
      lastFrameAt.current = Date.now();
      startCamera(macAddress);
    } else {
      setLanLoading(true);
    }
  };

  const swap = (next: Source) => {
    haptics.selection();
    setError(null);
    setSource(next);
    if (next === 'lan') {
      stopCamera(macAddress);
      setLanLoading(true);
    }
  };

  const live = source === 'relay' ? !!frame && !stalled : !lanLoading;

  return (
    <Screen wash={false}>
      <StatusBar barStyle="light-content" />

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
          <Text
            style={{ fontFamily: fonts.mono, fontSize: rem(11), color: theme.textMuted, marginTop: 1 }}
            numberOfLines={1}
          >
            {source === 'relay'
              ? `relay${fps ? ` · ${fps} fps` : ''}`
              : `${lanIp ?? '—'}:81`}
          </Text>
        </View>
        <IconButton icon="refresh" onPress={retry} label="Reload stream" />
      </View>

      {/* Source picker. LAN is offered only once an address is known. */}
      <View
        style={{
          flexDirection: 'row', gap: rem(spacing.sm),
          paddingHorizontal: rem(spacing.xl), paddingTop: rem(spacing.md),
        }}
      >
        {([
          { key: 'relay' as Source, label: 'Anywhere', hint: 'via server' },
          { key: 'lan' as Source, label: 'Local', hint: lanIp ? 'same WiFi' : 'not found' },
        ]).map((opt) => {
          const on = source === opt.key;
          const off = opt.key === 'lan' && !lanIp;
          return (
            <Pressable
              key={opt.key}
              onPress={() => !off && swap(opt.key)}
              disabled={off}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: off }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: rem(6),
                paddingVertical: rem(7), paddingHorizontal: rem(spacing.lg),
                borderRadius: radii.full,
                backgroundColor: on ? theme.primaryDim : 'transparent',
                borderWidth: 1,
                borderColor: on ? 'transparent' : theme.border,
                opacity: off ? 0.4 : 1,
              }}
            >
              <Text style={{ fontSize: rem(13), fontWeight: '600', color: on ? theme.primaryTint : theme.textDim }}>
                {opt.label}
              </Text>
              <Text style={{ fontSize: rem(10), color: theme.textMuted }}>{opt.hint}</Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flex: 1,
          margin: rem(spacing.lg),
          marginBottom: insets.bottom + rem(spacing.lg),
          borderRadius: radii.xl,
          overflow: 'hidden',
          backgroundColor: theme.bgSunken,
          borderWidth: 1,
          borderColor: theme.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {error && !frame ? (
          <View style={{ alignItems: 'center', padding: rem(spacing.xl) }}>
            <SignalArt size={rem(140)} tone={theme.textMuted} />
            <Text style={{ ...type.subheading, color: theme.text, marginTop: rem(spacing.lg) }}>
              No video from the rover
            </Text>
            <Text
              style={{
                ...type.caption, color: theme.textDim, textAlign: 'center',
                marginTop: rem(spacing.sm), maxWidth: rem(260),
              }}
            >
              {error}. Check the camera board is powered and has joined WiFi — it
              reports in on the same relay as the rover.
            </Text>
            <Button label="Try again" onPress={retry} full={false} style={{ marginTop: rem(spacing.xl) }} />
          </View>
        ) : source === 'relay' ? (
          <>
            {frame ? (
              <Image
                // Each frame is a whole JPEG, so swapping the source is the
                // entire render path — no decoder state to keep in sync.
                source={{ uri: `data:image/jpeg;base64,${frame}` }}
                style={{ width: '100%', height: '100%', opacity: stalled ? 0.35 : 1 }}
                resizeMode="contain"
                fadeDuration={0}
              />
            ) : (
              <View style={{ alignItems: 'center', gap: rem(spacing.md) }}>
                <ActivityIndicator size="large" color={theme.primaryTint} />
                <Text style={{ ...type.caption, color: theme.textDim }}>
                  {stalled ? 'No frames arriving' : 'Waiting for the camera…'}
                </Text>
              </View>
            )}

            {/* The last frame stays on screen, dimmed, rather than blanking —
                a frozen picture with a label reads as "the link stopped",
                where an empty box reads as "the app broke". */}
            {stalled && frame && (
              <View
                style={{
                  position: 'absolute',
                  alignItems: 'center',
                  gap: rem(spacing.md),
                  padding: rem(spacing.lg),
                }}
              >
                <MaterialCommunityIcons name="signal-off" size={rem(32)} color={theme.errorTint} />
                <Text style={{ ...type.bodyStrong, color: theme.text }}>Stream stopped</Text>
                <Text
                  style={{
                    ...type.caption, color: theme.textDim,
                    textAlign: 'center', maxWidth: rem(240),
                  }}
                >
                  The camera stopped sending. It reconnects on its own — or tap
                  refresh to ask for the stream again.
                </Text>
                <Button label="Retry" onPress={retry} full={false} />
              </View>
            )}
          </>
        ) : (
          <>
            {streamUrl && (
              <Image
                key={attempt}
                source={{ uri: `${streamUrl}${attempt ? `?r=${attempt}` : ''}`, headers: { 'Cache-Control': 'no-cache' } }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
                onLoad={() => setLanLoading(false)}
                onError={() => {
                  setLanLoading(false);
                  setError('The camera did not answer on port 81');
                }}
              />
            )}
            {lanLoading && (
              <View style={{ position: 'absolute', alignItems: 'center', gap: rem(spacing.md) }}>
                <ActivityIndicator size="large" color={theme.primaryTint} />
                <Text style={{ ...type.caption, color: theme.textDim }}>Opening stream…</Text>
              </View>
            )}
          </>
        )}

        {live && (
          <View
            style={{
              position: 'absolute',
              top: rem(spacing.md),
              left: rem(spacing.md),
              flexDirection: 'row',
              alignItems: 'center',
              gap: rem(4),
              paddingLeft: rem(4),
              paddingRight: rem(10),
              paddingVertical: rem(4),
              borderRadius: radii.full,
              backgroundColor: theme.error,
            }}
          >
            <PulseDot color="#FFF7ED" size={5} />
            <Text style={{ ...type.micro, color: '#FFF7ED' }}>LIVE</Text>
          </View>
        )}
      </View>
    </Screen>
  );
}
