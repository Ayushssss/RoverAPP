import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import DropdownMenu from '../components/DropdownMenu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { stats as statsApi } from '../services/api';
import { Skeleton } from '../components/Skeleton';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [statsData, setStatsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      try { const s = await statsApi.get(); setStatsData(s); }
      catch {}
      finally { setLoading(false); }
    })();
  }, []));

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  const menu = [
    { icon: 'account-cog-outline', label: 'Account Settings', color: theme.primary },
    { icon: 'bell-outline', label: 'Notifications', color: '#D4A53A' },
    { icon: 'shield-lock-outline', label: 'Privacy & Security', color: '#2A9D8F' },
    { icon: 'help-circle-outline', label: 'Help & Support', color: '#C86A45' },
    { icon: 'information-outline', label: 'About AgriVerse', color: theme.textMuted },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text, letterSpacing: -0.5 }}>Profile</Text>
        <DropdownMenu />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}>
        {/* Profile Card */}
        <View style={{ alignItems: 'center', padding: 24, backgroundColor: theme.surface, borderRadius: 20, borderWidth: 1, borderColor: theme.border, marginBottom: 20 }}>
          {loading ? (
            <>
              <Skeleton width={88} height={88} radius={44} style={{ marginBottom: 14 }} />
              <Skeleton width={120} height={18} radius={6} style={{ marginBottom: 8 }} />
              <Skeleton width={160} height={12} radius={5} style={{ marginBottom: 24 }} />
              <View style={{ flexDirection: 'row', gap: 0, width: '100%' }}>
                {[0, 1, 2].map(i => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <Skeleton width={40} height={18} radius={6} />
                    <Skeleton width={50} height={10} radius={5} />
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: theme.primary + '15', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: theme.primary }}>
                <Text style={{ fontSize: 32, fontWeight: '700', color: theme.primary }}>{(user?.name || 'F')[0]}</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text, marginTop: 14, letterSpacing: -0.3 }}>{user?.name || 'Farmer'}</Text>
              <Text style={{ fontSize: 13, color: theme.textDim, marginTop: 3 }}>{user?.email || ''}</Text>
              <View style={{ flexDirection: 'row', marginTop: 24 }}>
                {[
                  { val: `${statsData?.total ?? '--'}`, label: 'Rovers' },
                  { val: `${statsData?.clustersCount ?? '--'}`, label: 'Clusters' },
                  { val: `${statsData?.healthScore ?? '--'}%`, label: 'Health' },
                ].map((x, i) => (
                  <React.Fragment key={i}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>{x.val}</Text>
                      <Text style={{ fontSize: 11, color: theme.textDim, marginTop: 3 }}>{x.label}</Text>
                    </View>
                    {i < 2 && <View style={{ width: 1, height: 32, backgroundColor: theme.border, alignSelf: 'center' }} />}
                  </React.Fragment>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Menu */}
        {loading ? (
          <View style={{ backgroundColor: theme.surface, borderRadius: 20, borderWidth: 1, borderColor: theme.border, padding: 8, gap: 4 }}>
            {[1, 2, 3, 4, 5].map(i => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 14 }}>
                <Skeleton width={38} height={38} radius={12} />
                <Skeleton width={140} height={13} radius={6} />
              </View>
            ))}
          </View>
        ) : (
          <View style={{ backgroundColor: theme.surface, borderRadius: 20, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
            {menu.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: i < menu.length - 1 ? 1 : 0, borderBottomColor: theme.border }}
                activeOpacity={0.6}
              >
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: item.color + '18', justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
                  <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, color: theme.text }}>{item.label}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Sign Out */}
        <TouchableOpacity
          onPress={handleLogout}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, padding: 16, backgroundColor: 'rgba(220,38,38,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(220,38,38,0.2)' }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="logout" size={18} color="#DC2626" />
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#DC2626' }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
