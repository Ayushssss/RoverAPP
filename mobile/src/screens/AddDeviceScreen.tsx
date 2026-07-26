import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { devices as devicesApi } from '../services/api';
import { useTheme } from '../context/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddDevice'>;

export default function AddDeviceScreen() {
  const nav = useNavigation<Nav>();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [mac, setMac] = useState('');
  const [loading, setLoading] = useState(false);
  const formatMac = (val: string) => {
    const cleaned = val.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
    const parts: string[] = [];
    for (let i = 0; i < cleaned.length && parts.length < 6; i += 2) parts.push(cleaned.slice(i, i + 2));
    return parts.join(':');
  };
  const handleAdd = async () => {
    if (!name.trim()) { Alert.alert('', 'Device name required'); return; }
    if (mac.length < 17) { Alert.alert('', 'Enter a valid MAC address'); return; }
    setLoading(true);
    try {
      await devicesApi.add({ name: name.trim(), macAddress: mac });
      Alert.alert('', `${name} added`, [{ text: 'OK', onPress: () => nav.goBack() }]);
    } catch (e: any) { Alert.alert('Error', e?.message || e?.response?.data?.error || 'Failed to save device'); } finally { setLoading(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={[styles.backBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.backArrow, { color: theme.text }]}>←</Text></TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>New device</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.body}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textDim }]}>Device name</Text>
          <TextInput style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={name} onChangeText={setName} placeholder="My Rover" placeholderTextColor={theme.textMuted} />
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textDim }]}>MAC address</Text>
          <TextInput style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text, fontFamily: 'monospace', letterSpacing: 1.5 }]} value={mac} onChangeText={v => setMac(formatMac(v))} placeholder="AA:BB:CC:DD:EE:FF" placeholderTextColor={theme.textMuted} maxLength={17} autoCapitalize="characters" />
          <Text style={[styles.hint, { color: theme.textMuted }]}>Found on your ESP32 serial output at startup</Text>
        </View>
        <TouchableOpacity style={[styles.button]} onPress={handleAdd} disabled={loading} activeOpacity={0.9}>
          <LinearGradient colors={[theme.primary, theme.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGrad}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register device</Text>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  backArrow: { fontSize: 20 },
  title: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  field: { marginBottom: 20 },
  label: { fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.5 },
  input: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 15 },
  hint: { fontSize: 11, marginTop: 6 },
  button: { marginTop: 12, borderRadius: 12, overflow: 'hidden' },
  buttonGrad: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: 0.3 },
});
