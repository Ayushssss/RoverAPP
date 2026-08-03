import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TextInput, Modal, Pressable, Alert, Platform,
} from 'react-native';
import Animated, { FadeIn as RFadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../context/ThemeContext';
import { devices as devicesApi } from '../services/api';
import DropdownMenu from '../components/DropdownMenu';
import { Skeleton } from '../components/Skeleton';
import { FurrowArt } from '../components/Illustrations';
import { useToast } from '../components/Toast';
import { haptics } from '../haptics';
import { rem, spacing, radii, type, fonts, elevation } from '../theme';
import { TabHeader, Press, PulseDot, EmptyState, IconButton, Card } from '../components/ui';

interface Device { id: string; name: string; mac_address: string; created_at?: string }

type SortKey = 'name' | 'recent';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Newest' },
  { key: 'name', label: 'A-Z' },
];

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: rem(spacing.sm),
        backgroundColor: theme.surface,
        borderRadius: radii.lg,
        borderWidth: focused ? 2 : 1,
        borderColor: focused ? theme.ring : theme.border,
        paddingHorizontal: rem(spacing.md) - (focused ? 1 : 0),
        minHeight: 46,
      }}
    >
      <MaterialCommunityIcons name="magnify" size={rem(18)} color={focused ? theme.primaryTint : theme.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search name or MAC"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Search rovers"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          fontSize: rem(14),
          color: theme.text,
          paddingVertical: rem(11),
          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null),
        }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <MaterialCommunityIcons name="close-circle" size={rem(16)} color={theme.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

function ActionSheet({
  device, onClose, onDelete, onCopy,
}: {
  device: Device | null;
  onClose: () => void;
  onDelete: (d: Device) => void;
  onCopy: (d: Device) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!device} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: theme.scrim, justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: theme.surfaceElevated,
            borderTopLeftRadius: radii.xxl,
            borderTopRightRadius: radii.xxl,
            borderWidth: 1,
            borderColor: theme.border,
            paddingTop: rem(spacing.md),
            paddingBottom: insets.bottom + rem(spacing.lg),
            ...elevation(theme.shadow, 3),
          }}
        >
          <View
            style={{
              alignSelf: 'center', width: rem(38), height: 4, borderRadius: 2,
              backgroundColor: theme.borderStrong, marginBottom: rem(spacing.lg),
            }}
          />

          {device && (
            <View style={{ paddingHorizontal: rem(spacing.xl), marginBottom: rem(spacing.md) }}>
              <Text style={{ ...type.subheading, color: theme.text }} numberOfLines={1}>{device.name}</Text>
              <Text style={{ fontFamily: fonts.mono, fontSize: rem(11), color: theme.textMuted, marginTop: 2 }}>
                {device.mac_address}
              </Text>
            </View>
          )}

          <Press onPress={() => device && onCopy(device)} label="Copy MAC address">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md), paddingVertical: rem(14), paddingHorizontal: rem(spacing.xl) }}>
              <MaterialCommunityIcons name="content-copy" size={rem(19)} color={theme.textDim} />
              <Text style={{ ...type.body, color: theme.text }}>Copy MAC address</Text>
            </View>
          </Press>

          <Press onPress={() => device && onDelete(device)} label="Remove rover">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md), paddingVertical: rem(14), paddingHorizontal: rem(spacing.xl) }}>
              <MaterialCommunityIcons name="trash-can-outline" size={rem(19)} color={theme.errorTint} />
              <Text style={{ ...type.body, color: theme.errorTint }}>Remove rover</Text>
            </View>
          </Press>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function RoversScreen() {
  const nav = useNavigation<any>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [sheetFor, setSheetFor] = useState<Device | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices((await devicesApi.list()) || []);
    } catch (e) {
      console.warn('rovers: fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? devices.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.mac_address.toLowerCase().replace(/:/g, '').includes(q.replace(/:/g, ''))
        )
      : devices;

    return [...filtered].sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : (b.created_at || '').localeCompare(a.created_at || '')
    );
  }, [devices, query, sort]);

  const copyMac = useCallback(async (d: Device) => {
    setSheetFor(null);
    await Clipboard.setStringAsync(d.mac_address);
    haptics.tap();
    toast.show('MAC address copied', { tone: 'info' });
  }, [toast]);

  const confirmDelete = useCallback((d: Device) => {
    setSheetFor(null);
    haptics.warning();

    // A blocking confirm is right here: removal is destructive and the undo
    // below is a safety net, not a substitute for asking.
    Alert.alert('Remove rover', `${d.name} will be unpaired from this account.`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setDevices((list) => list.filter((x) => x.id !== d.id));
          try {
            await devicesApi.remove(d.id);
            toast.success(`${d.name} removed`, {
              label: 'Undo',
              onPress: async () => {
                try {
                  await devicesApi.add({ name: d.name, macAddress: d.mac_address });
                  load();
                } catch {
                  toast.error('Could not restore that rover');
                }
              },
            });
          } catch (e: any) {
            load();
            toast.error(e?.message || 'Could not remove that rover');
          }
        },
      },
    ]);
  }, [toast, load]);

  const openRover = useCallback((r: Device) => {
    haptics.tap();
    nav.navigate('RoverHub', { deviceName: r.name, macAddress: r.mac_address });
  }, [nav]);

  const showControls = !loading && devices.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <TabHeader
        title="Rovers"
        subtitle={loading ? ' ' : `${devices.length} registered`}
        loading={loading}
        right={
          <View style={{ flexDirection: 'row', gap: rem(spacing.sm) }}>
            <IconButton icon="plus" onPress={() => nav.navigate('AddDevice')} label="Add rover" size={38} />
            <DropdownMenu />
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: rem(spacing.xl),
          paddingBottom: insets.bottom + rem(96),
          flexGrow: 1,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryTint} />}
      >
        {showControls && (
          <View style={{ gap: rem(spacing.md), marginBottom: rem(spacing.lg) }}>
            <SearchField value={query} onChange={setQuery} />

            <View style={{ flexDirection: 'row', gap: rem(spacing.sm) }}>
              {SORTS.map((s) => {
                const on = sort === s.key;
                return (
                  <Press
                    key={s.key}
                    label={`Sort by ${s.label}`}
                    onPress={() => { haptics.selection(); setSort(s.key); }}
                  >
                    <View
                      style={{
                        paddingVertical: rem(7),
                        paddingHorizontal: rem(spacing.md),
                        borderRadius: radii.full,
                        backgroundColor: on ? theme.primaryDim : 'transparent',
                        borderWidth: 1,
                        borderColor: on ? 'transparent' : theme.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: rem(12),
                          fontWeight: '600',
                          color: on ? theme.primaryTint : theme.textDim,
                        }}
                      >
                        {s.label}
                      </Text>
                    </View>
                  </Press>
                );
              })}
            </View>
          </View>
        )}

        {loading ? (
          <View style={{ gap: rem(spacing.md) }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  backgroundColor: theme.surface, borderRadius: radii.xl,
                  borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md), padding: rem(spacing.lg) }}>
                  <Skeleton width={rem(46)} height={rem(46)} radius={radii.lg} delay={i * 90} />
                  <View style={{ flex: 1, gap: rem(7) }}>
                    <Skeleton width="50%" height={rem(14)} radius={6} delay={i * 90 + 60} />
                    <Skeleton width="70%" height={rem(10)} radius={5} delay={i * 90 + 120} />
                  </View>
                </View>
                <View style={{ height: rem(38), borderTopWidth: 1, borderTopColor: theme.border }} />
              </View>
            ))}
          </View>
        ) : devices.length === 0 ? (
          <Card dashed padded={false} style={{ marginTop: rem(spacing.xl) }}>
            <EmptyState
              art={<FurrowArt size={rem(180)} />}
              title="No rovers registered"
              body="Pair an ESP32 by its MAC address and it will show up here, ready to drive."
              actionLabel="Add your first rover"
              onAction={() => nav.navigate('AddDevice')}
            />
          </Card>
        ) : visible.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: rem(spacing.xxxl), gap: rem(spacing.sm) }}>
            <MaterialCommunityIcons name="magnify-close" size={rem(34)} color={theme.textMuted} />
            <Text style={{ ...type.subheading, color: theme.text }}>No match</Text>
            <Text style={{ ...type.caption, color: theme.textDim, textAlign: 'center' }}>
              Nothing here matches “{query.trim()}”.
            </Text>
          </View>
        ) : (
          <View style={{ gap: rem(spacing.md) }}>
            {visible.map((rover, i) => {
              const gold = i % 2 === 1;
              const tint = gold ? theme.accentTint : theme.primaryTint;
              const dim = gold ? theme.accentDim : theme.primaryDim;

              return (
                <Animated.View
                  key={rover.id}
                  entering={RFadeIn.duration(220).delay(Math.min(i, 8) * 40)}
                  exiting={FadeOut.duration(150)}
                  layout={LinearTransition.springify().damping(20).stiffness(160)}
                >
                  <Press
                    label={`Control ${rover.name}`}
                    onPress={() => openRover(rover)}
                    onLongPress={() => { haptics.press(); setSheetFor(rover); }}
                  >
                    <View
                      style={{
                        backgroundColor: theme.surface,
                        borderRadius: radii.xl,
                        borderWidth: 1,
                        borderColor: theme.border,
                        overflow: 'hidden',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md), padding: rem(spacing.lg) }}>
                        <View
                          style={{
                            width: rem(46), height: rem(46), borderRadius: radii.lg,
                            backgroundColor: dim, alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <MaterialCommunityIcons name="robot-outline" size={rem(23)} color={tint} />
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ ...type.subheading, color: theme.text }} numberOfLines={1}>
                            {rover.name}
                          </Text>
                          <Text
                            style={{ fontFamily: fonts.mono, fontSize: rem(11), color: theme.textMuted, marginTop: 3 }}
                            numberOfLines={1}
                          >
                            {rover.mac_address}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(4) }}>
                          <PulseDot color={theme.successTint} size={rem(6)} />
                          <Text style={{ ...type.caption, color: theme.textDim }}>Online</Text>
                        </View>
                      </View>

                      <View
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          paddingHorizontal: rem(spacing.lg), paddingVertical: rem(11),
                          borderTopWidth: 1, borderTopColor: theme.border,
                        }}
                      >
                        <Text style={{ ...type.caption, color: theme.textDim }}>Hold for options</Text>
                        <MaterialCommunityIcons name="gamepad-variant-outline" size={rem(15)} color={theme.textMuted} />
                      </View>
                    </View>
                  </Press>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <ActionSheet
        device={sheetFor}
        onClose={() => setSheetFor(null)}
        onCopy={copyMac}
        onDelete={confirmDelete}
      />
    </View>
  );
}
