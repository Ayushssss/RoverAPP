import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { connectSocket, registerDevice, sendJoystick, sendCommand, disconnectSocket } from '../services/websocket';
import Joystick from '../components/Joystick';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const R = 12;

type ControlRoute = RouteProp<RootStackParamList, 'Control'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'Control'>;

export default function ControlScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<ControlRoute>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { deviceName, macAddress } = route.params;
  const [connected, setConnected] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [lightOn, setLightOn] = useState(false);
  const [espIp, setEspIp] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }).start();
    let isMounted = true;
    (async () => {
      try {
        const token = user ? user.id : undefined;
        await connectSocket(token);
        if (isMounted) {
          setConnected(true);
          registerDevice(macAddress, (ip) => {
            if (isMounted) setEspIp(ip);
          });
        }
      } catch {
        if (isMounted) setConnected(false);
      }
    })();
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.3, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    pulse.start();
    return () => {
      isMounted = false;
      disconnectSocket();
      pulse.stop();
    };
  }, [macAddress]);

  const handleMove = useCallback((x: number, y: number) => {
    setCoords({ x, y });
    sendJoystick(macAddress, x, y);
  }, [macAddress]);

  const handleCommand = useCallback((cmd: string) => {
    if (cmd === 'stop') setCoords({ x: 0, y: 0 });
    if (cmd === 'light') setLightOn(p => !p);
    sendCommand(macAddress, cmd, 1);
  }, [macAddress]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} activeOpacity={0.7}>
          <Text style={[styles.backArrow, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: theme.text }]}>{deviceName}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDotOuter, { borderColor: connected ? theme.primary + '40' : theme.error + '40' }]}>
              <View style={[styles.statusDot, { backgroundColor: connected ? theme.success : theme.error }]} />
            </View>
            <Text style={[styles.statusText, { color: connected ? theme.textSecondary : theme.textDim }]}>
              {connected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => handleCommand('light')} style={[styles.iconBtn, { backgroundColor: lightOn ? '#D4A53A' : theme.surface, borderColor: '#D4A53A' }]}>
            <MaterialCommunityIcons name={lightOn ? 'lightbulb-on' : 'lightbulb-outline'} size={18} color={lightOn ? '#0B0F1C' : '#D4A53A'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => espIp && nav.navigate('Camera', { deviceName, ip: espIp })}
            style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: espIp ? 1 : 0.4 }]}
            disabled={!espIp}
          >
            <MaterialCommunityIcons name="camera" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={[styles.body, { opacity: fadeAnim }]}>
        <View style={styles.joystickArea}>
          <View style={[styles.joystickGlow, { backgroundColor: theme.primary + '08' }]}>
            <Joystick onMove={handleMove} onRelease={() => handleCommand('stop')} />
          </View>
          <View style={styles.coordsWrap}>
            <View style={[styles.coord]}>
              <Text style={[styles.coordLabel, { color: theme.textMuted }]}>X</Text>
              <Text style={[styles.coordValue, { color: theme.textSecondary }]}>{coords.x.toFixed(2)}</Text>
            </View>
            <View style={[styles.coordDivider, { backgroundColor: theme.border }]} />
            <View style={[styles.coord]}>
              <Text style={[styles.coordLabel, { color: theme.textMuted }]}>Y</Text>
              <Text style={[styles.coordValue, { color: theme.textSecondary }]}>{coords.y.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.dpadWrap}>
          <Text style={[styles.dpadLabel, { color: theme.textMuted }]}>D-PAD</Text>
          <View style={styles.dpadGrid}>
            <TouchableOpacity style={[styles.dpadTop, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => handleCommand('forward')} activeOpacity={0.6}>
              <Text style={[styles.dpadArrow, { color: theme.textSecondary }]}>▲</Text>
            </TouchableOpacity>
            <View style={styles.dpadMiddle}>
              <TouchableOpacity style={[styles.dpadSide, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => handleCommand('left')} activeOpacity={0.6}>
                <Text style={[styles.dpadArrow, { color: theme.textSecondary }]}>◀</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dpadStop, { backgroundColor: theme.surface }]} onPress={() => handleCommand('stop')} activeOpacity={0.6}>
                <View style={[styles.dpadStopInner, { backgroundColor: theme.error }]} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dpadSide, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => handleCommand('right')} activeOpacity={0.6}>
                <Text style={[styles.dpadArrow, { color: theme.textSecondary }]}>▶</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.dpadBottom, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => handleCommand('backward')} activeOpacity={0.6}>
              <Text style={[styles.dpadArrow, { color: theme.textSecondary }]}>▼</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: R, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  backArrow: { fontSize: 20 },
  headerCenter: { alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  statusDotOuter: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, letterSpacing: 0.3 },
  headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: R, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1 },
  joystickArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  joystickGlow: { padding: 20, borderRadius: 160 },
  coordsWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  coord: { alignItems: 'center', paddingHorizontal: 24 },
  coordLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 },
  coordValue: { fontSize: 16, fontFamily: 'monospace', fontWeight: '500' },
  coordDivider: { width: 1, height: 30 },
  dpadWrap: { paddingHorizontal: 40, paddingBottom: 40, alignItems: 'center' },
  dpadLabel: { fontSize: 9, letterSpacing: 3, marginBottom: 16 },
  dpadGrid: { alignItems: 'center' },
  dpadTop: { width: 52, height: 48, borderWidth: 1, borderTopLeftRadius: R, borderTopRightRadius: R, justifyContent: 'center', alignItems: 'center' },
  dpadMiddle: { flexDirection: 'row', alignItems: 'center' },
  dpadSide: { width: 48, height: 52, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  dpadStop: { width: 52, height: 52, borderWidth: 1, borderColor: '#ef444440', justifyContent: 'center', alignItems: 'center' },
  dpadStopInner: { width: 18, height: 18, borderRadius: 4 },
  dpadBottom: { width: 52, height: 48, borderWidth: 1, borderBottomLeftRadius: R, borderBottomRightRadius: R, justifyContent: 'center', alignItems: 'center' },
  dpadArrow: { fontSize: 16 },
});
