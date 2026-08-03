import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, SCHEME_LIST } from '../context/ThemeContext';
import DropdownMenu from '../components/DropdownMenu';
import { Skeleton } from '../components/Skeleton';
import { haptics } from '../haptics';
import { rem, spacing, radii, type } from '../theme';
import { TabHeader, Card, ListRow, Toggle, FadeIn, Press } from '../components/ui';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Item {
  icon: IconName;
  label: string;
  value?: string;
  toggle?: boolean;
}

function SchemePicker() {
  const { theme, schemeId, setScheme } = useTheme();

  return (
    <View style={{ gap: rem(spacing.md) }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: rem(spacing.sm), paddingVertical: 2 }}
      >
        {SCHEME_LIST.map((s) => {
          const on = schemeId === s.id;
          return (
            <Press
              key={s.id}
              label={`${s.name} colour scheme`}
              onPress={() => { haptics.selection(); setScheme(s.id); }}
            >
              <View
                style={{
                  width: rem(104),
                  padding: rem(spacing.md),
                  borderRadius: radii.lg,
                  backgroundColor: theme.surface,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? theme.primaryTint : theme.border,
                  gap: rem(spacing.sm),
                }}
              >
                {/* Swatch reads as the scheme itself, not as a colour chip */}
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <View style={{ flex: 2, height: rem(26), borderRadius: 7, backgroundColor: s.swatch[0] }} />
                  <View style={{ flex: 1, height: rem(26), borderRadius: 7, backgroundColor: s.swatch[1] }} />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text
                    style={{ fontSize: rem(12), fontWeight: '700', color: theme.text, flex: 1 }}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                  {on && <MaterialCommunityIcons name="check-circle" size={rem(13)} color={theme.primaryTint} />}
                </View>
              </View>
            </Press>
          );
        })}
      </ScrollView>

      <Text style={{ ...type.caption, color: theme.textMuted }}>
        {SCHEME_LIST.find((s) => s.id === schemeId)?.blurb}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const { theme, isDark, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 450);
    return () => clearTimeout(t);
  }, []);

  const sections: { title: string; items: Item[] }[] = [
    {
      title: 'Appearance',
      items: [{ icon: isDark ? 'weather-night' : 'weather-sunny', label: 'Dark mode', toggle: true }],
    },
    {
      title: 'Connection',
      items: [
        { icon: 'wifi', label: 'WiFi networks', value: '3 saved' },
        { icon: 'signal-cellular-outline', label: 'Cellular backup', value: 'Enabled' },
        { icon: 'update', label: 'Auto updates', value: 'On' },
      ],
    },
    {
      title: 'Data',
      items: [
        { icon: 'database-outline', label: 'Sync frequency', value: 'Real-time' },
        { icon: 'cloud-upload-outline', label: 'Cloud backup', value: 'Daily' },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'file-document-outline', label: 'Terms of service' },
        { icon: 'shield-check-outline', label: 'Privacy policy' },
      ],
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <TabHeader title="Settings" right={<DropdownMenu />} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: rem(spacing.xl),
          paddingBottom: insets.bottom + rem(96),
        }}
      >
        {loading ? (
          <View style={{ gap: rem(spacing.xxl) }}>
            {[1, 3, 2].map((count, si) => (
              <View key={si} style={{ gap: rem(spacing.md) }}>
                <Skeleton width={rem(90)} height={rem(10)} radius={5} />
                <View
                  style={{
                    backgroundColor: theme.surface, borderRadius: radii.xl,
                    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
                  }}
                >
                  {Array.from({ length: count }, (_, ii) => (
                    <View
                      key={ii}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md),
                        padding: rem(spacing.lg),
                        borderTopWidth: ii === 0 ? 0 : 1, borderTopColor: theme.border,
                      }}
                    >
                      <Skeleton width={rem(36)} height={rem(36)} radius={radii.md} />
                      <Skeleton width="45%" height={rem(13)} radius={6} />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <>
            <FadeIn index={0} style={{ marginBottom: rem(spacing.xxl) }}>
              <Text
                style={{
                  ...type.micro,
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  marginBottom: rem(spacing.md),
                  marginLeft: rem(spacing.xs),
                }}
              >
                Colour scheme
              </Text>
              <SchemePicker />
            </FadeIn>

            {sections.map((section, si) => (
              <FadeIn key={section.title} index={si} style={{ marginBottom: rem(spacing.xxl) }}>
                <Text
                  style={{
                    ...type.micro,
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: rem(spacing.md),
                    marginLeft: rem(spacing.xs),
                  }}
                >
                  {section.title}
                </Text>

                <Card padded={false}>
                  {section.items.map((item, ii) => (
                    <ListRow
                      key={item.label}
                      icon={item.icon}
                      label={item.label}
                      value={item.toggle ? undefined : item.value}
                      first={ii === 0}
                      onPress={item.toggle ? toggle : () => {}}
                      right={item.toggle ? <Toggle value={isDark} onChange={toggle} /> : undefined}
                    />
                  ))}
                </Card>
              </FadeIn>
            ))}

            <Text style={{ ...type.caption, color: theme.textMuted, textAlign: 'center' }}>
              AgriVerse Rover · v2.4.0
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
