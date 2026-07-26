import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { devices as devicesApi } from '../services/api';
import DropdownMenu from '../components/DropdownMenu';
import { LinearGradient } from 'expo-linear-gradient';
import { Skeleton, SkeletonCard } from '../components/Skeleton';

interface Device { id: string; name: string; mac_address: string; }

export default function RoversScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await devicesApi.list(); setDevices(d || []); }
    catch (e) {}
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.border }}>
        {loading ? (
          <View style={{ gap: 6 }}>
            <Skeleton width={100} height={22} radius={6} />
            <Skeleton width={70} height={11} radius={5} />
          </View>
        ) : (
          <View>
            <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text, letterSpacing: -0.5 }}>Rovers</Text>
            <Text style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{devices.length} registered</Text>
          </View>
        )}
        <DropdownMenu />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading ? (
          <View style={{ gap: 10 }}>
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </View>
        ) : devices.length === 0 ? (
          <TouchableOpacity onPress={() => nav.navigate('AddDevice')} style={{ padding: 48, backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', alignItems: 'center', gap: 12, marginTop: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: theme.primary + '15', justifyContent: 'center', alignItems: 'center' }}>
              <MaterialCommunityIcons name="robot-outline" size={36} color={theme.primary} />
            </View>
            <Text style={{ fontSize: 15, color: theme.textDim, textAlign: 'center' }}>No rovers registered{'\n'}Tap to add your first device</Text>
            <View style={{ paddingHorizontal: 20, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Add Rover</Text>
            </View>
          </TouchableOpacity>
        ) : (
          devices.map((rover, i) => (
            <TouchableOpacity
              key={rover.id}
              style={{ marginBottom: 10, backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}
              activeOpacity={0.7}
              onPress={() => nav.navigate('Control', { deviceId: rover.name, deviceName: rover.name, macAddress: rover.mac_address })}
            >
              <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <LinearGradient colors={i % 2 === 0 ? ['#D4A53A', '#B8860B'] : ['#2A9D8F', '#1E7A6F']} style={{ width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="robot-outline" size={24} color="#fff" />
                  </LinearGradient>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: theme.text }} numberOfLines={1}>{rover.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary }} />
                      <Text style={{ fontSize: 11, color: theme.textDim }}>Online</Text>
                      <Text style={{ fontSize: 10, color: theme.textMuted }} numberOfLines={1}>{rover.mac_address}</Text>
                    </View>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
              </View>
              <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>Tap to control</Text>
                <MaterialCommunityIcons name="gamepad-variant-outline" size={14} color={theme.textMuted} />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
