import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import DropdownMenu from '../components/DropdownMenu';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton } from '../components/Skeleton';

export default function SettingsScreen() {
  const { theme, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const sections = [
    {
      title: 'APPEARANCE',
      items: [
        { icon: isDark ? 'weather-night' : 'weather-sunny', label: 'Dark Mode', value: isDark, toggle: true },
      ],
    },
    {
      title: 'CONNECTION',
      items: [
        { icon: 'wifi', label: 'WiFi Networks', value: '3 saved', toggle: false },
        { icon: 'signal-cellular-outline', label: 'Cellular Backup', value: 'Enabled', toggle: false },
        { icon: 'update', label: 'Auto Updates', value: 'On', toggle: false },
      ],
    },
    {
      title: 'DATA',
      items: [
        { icon: 'database-outline', label: 'Sync Frequency', value: 'Real-time', toggle: false },
        { icon: 'cloud-upload-outline', label: 'Cloud Backup', value: 'Daily', toggle: false },
      ],
    },
    {
      title: 'SUPPORT',
      items: [
        { icon: 'file-document-outline', label: 'Terms of Service', value: undefined, toggle: false },
        { icon: 'shield-check-outline', label: 'Privacy Policy', value: undefined, toggle: false },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: theme.text, letterSpacing: -0.5 }}>Settings</Text>
        <DropdownMenu />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}>
        {loading ? (
          <View style={{ gap: 24 }}>
            {[3, 4, 3].map((count, si) => (
              <View key={si} style={{ gap: 8 }}>
                <Skeleton width={80} height={10} radius={5} style={{ marginLeft: 4, marginBottom: 2 }} />
                <View style={{ backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
                  {Array(count).fill(0).map((_, ii) => (
                    <View key={ii} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: ii < count - 1 ? 1 : 0, borderBottomColor: theme.border, gap: 14 }}>
                      <Skeleton width={36} height={36} radius={10} />
                      <Skeleton width={130} height={13} radius={6} />
                      <View style={{ flex: 1 }} />
                      <Skeleton width={44} height={24} radius={12} />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <>
            {sections.map((section, si) => (
              <View key={si} style={{ marginBottom: 24 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, letterSpacing: 1.5, marginBottom: 8, paddingLeft: 4 }}>{section.title}</Text>
                <View style={{ backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
                  {section.items.map((item, ii) => (
                    <TouchableOpacity
                      key={ii}
                      onPress={item.toggle ? toggle : undefined}
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: ii < section.items.length - 1 ? 1 : 0, borderBottomColor: theme.border }}
                      activeOpacity={0.6}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.border, justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
                        <MaterialCommunityIcons name={item.icon as any} size={18} color={theme.textDim} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 14, color: theme.text }}>{item.label}</Text>
                      {item.toggle ? (
                        <View style={{ width: 48, height: 26, borderRadius: 13, backgroundColor: item.value ? theme.primary : theme.textMuted, justifyContent: 'center', paddingHorizontal: 3 }}>
                          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: item.value ? 'flex-end' : 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }} />
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {item.value && <Text style={{ fontSize: 12, color: theme.textDim }}>{item.value}</Text>}
                          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.textMuted} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
            <Text style={{ fontSize: 10, color: theme.textMuted, textAlign: 'center', marginTop: 8 }}>AgriVerse ROVER v2.4.0 · SQLite DB</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
