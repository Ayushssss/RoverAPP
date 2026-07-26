import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Animated, Modal, Pressable, Dimensions, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');
const M_W = Math.min(SCREEN_W - 32, 280);

const groups = [
  {
    items: [
      { label: 'Home', icon: 'view-dashboard-outline', screen: 'Home' },
      { label: 'Rovers', icon: 'robot-outline', screen: 'Rovers' },
    ],
  },
  {
    items: [
      { label: 'Add Device', icon: 'plus-circle-outline', screen: 'AddDevice' },
      { label: 'Clusters', icon: 'sitemap-outline', screen: 'Clusters' },
    ],
  },
  {
    items: [
      { label: 'Profile', icon: 'account-outline', screen: 'Profile' },
      { label: 'Settings', icon: 'cog-outline', screen: 'Settings' },
    ],
  },
];

export default function DropdownMenu() {
  const [open, setOpen] = useState(false);
  const nav = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    } else {
      fade.setValue(0);
      slide.setValue(-16);
    }
  }, [open]);

  const handleNav = (screen: string) => {
    setOpen(false);
    setTimeout(() => {
      try { nav.navigate(screen as any); } catch {}
    }, 200);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          width: 38, height: 38, borderRadius: 11,
          justifyContent: 'center', alignItems: 'center',
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        }}
      >
        <MaterialCommunityIcons name="menu" size={20} color={theme.text} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <Animated.View
            style={{
              position: 'absolute', top: insets.top + 52, right: 16, width: M_W,
              backgroundColor: isDark ? '#1B2336' : '#FFFFFF',
              borderRadius: 20, borderWidth: 1, borderColor: theme.border,
              paddingVertical: 6,
              opacity: fade, transform: [{ translateY: slide }],
              shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
              shadowOpacity: isDark ? 0.5 : 0.1, shadowRadius: 32, elevation: 24,
            }}
          >
            {groups.map((group, gi) => (
              <View key={gi}>
                {gi > 0 && <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 4, marginHorizontal: 14 }} />}
                {group.items.map((item) => (
                  <TouchableOpacity
                    key={item.screen}
                    onPress={() => handleNav(item.screen)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 18 }}
                    activeOpacity={0.5}
                  >
                    <MaterialCommunityIcons name={item.icon as any} size={19} color={theme.textDim} />
                    <Text style={{ fontSize: 14, fontWeight: '500', color: theme.text }}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}
