import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { stats as statsApi } from '../services/api';
import DropdownMenu from '../components/DropdownMenu';
import { Skeleton } from '../components/Skeleton';
import { rem, spacing, radii, type } from '../theme';
import { TabHeader, Card, ListRow, Button, FadeIn } from '../components/ui';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [statsData, setStatsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          setStatsData(await statsApi.get());
        } catch (e) {
          console.warn('profile: stats failed', e);
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const handleLogout = () => {
    Alert.alert('Sign out', 'You will need your password to get back in.', [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  const initial = (user?.name || user?.email || 'A').trim().charAt(0).toUpperCase();

  const figures = [
    { value: statsData?.total ?? 0, label: 'Rovers' },
    { value: statsData?.clustersCount ?? 0, label: 'Clusters' },
    { value: `${statsData?.healthScore ?? 0}%`, label: 'Health' },
  ];

  const menu = [
    { icon: 'account-cog-outline' as const, label: 'Account settings', color: theme.primaryTint },
    { icon: 'bell-outline' as const, label: 'Notifications', color: theme.accentTint },
    { icon: 'shield-lock-outline' as const, label: 'Privacy & security', color: theme.successTint },
    { icon: 'lifebuoy' as const, label: 'Help & support', color: theme.primaryTint },
    { icon: 'information-outline' as const, label: 'About AgriVerse', color: theme.textDim },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <TabHeader title="Profile" right={<DropdownMenu />} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: rem(spacing.xl),
          paddingBottom: insets.bottom + rem(96),
        }}
      >
        <FadeIn index={0}>
          <Card style={{ alignItems: 'center', paddingVertical: rem(spacing.xxl) }}>
            {loading ? (
              <>
                <Skeleton width={rem(84)} height={rem(84)} radius={rem(42)} />
                <Skeleton width={rem(140)} height={rem(18)} radius={6} style={{ marginTop: rem(spacing.lg) }} />
                <Skeleton width={rem(180)} height={rem(12)} radius={5} style={{ marginTop: rem(spacing.sm) }} />
              </>
            ) : (
              <>
                <View
                  style={{
                    width: rem(84), height: rem(84), borderRadius: rem(42),
                    backgroundColor: theme.primaryDim,
                    borderWidth: 2, borderColor: theme.primaryTint,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: rem(32), fontWeight: '700', color: theme.primaryTint }}>{initial}</Text>
                </View>

                <Text style={{ ...type.heading, color: theme.text, marginTop: rem(spacing.lg) }} numberOfLines={1}>
                  {user?.name || 'Operator'}
                </Text>
                {!!user?.email && (
                  <Text style={{ ...type.caption, color: theme.textDim, marginTop: 3 }} numberOfLines={1}>
                    {user.email}
                  </Text>
                )}
              </>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'stretch',
                marginTop: rem(spacing.xxl),
                paddingTop: rem(spacing.lg),
                borderTopWidth: 1,
                borderTopColor: theme.border,
              }}
            >
              {figures.map((f, i) => (
                <React.Fragment key={f.label}>
                  {i > 0 && <View style={{ width: 1, height: rem(30), backgroundColor: theme.border }} />}
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: rem(20), fontWeight: '700', color: theme.text, letterSpacing: -0.5 }}>
                      {loading ? '—' : f.value}
                    </Text>
                    <Text style={{ ...type.caption, color: theme.textDim, marginTop: 2 }}>{f.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </Card>
        </FadeIn>

        <FadeIn index={1} style={{ marginTop: rem(spacing.xl) }}>
          <Card padded={false}>
            {menu.map((item, i) => (
              <ListRow
                key={item.label}
                icon={item.icon}
                iconColor={item.color}
                label={item.label}
                first={i === 0}
                onPress={() => {}}
              />
            ))}
          </Card>
        </FadeIn>

        <FadeIn index={2}>
          <Button
            label="Sign out"
            variant="danger"
            icon="logout"
            onPress={handleLogout}
            style={{ marginTop: rem(spacing.xxl) }}
          />
        </FadeIn>

        <Text
          style={{
            ...type.caption,
            color: theme.textMuted,
            textAlign: 'center',
            marginTop: rem(spacing.xl),
          }}
        >
          AgriVerse Rover · v2.4.0
        </Text>
      </ScrollView>
    </View>
  );
}
