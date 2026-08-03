import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { devices as devicesApi } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { rem, spacing, radii, type } from '../theme';
import { Screen, ScreenHeader, Field, Button, FadeIn } from '../components/ui';
import { useToast } from '../components/Toast';
import KeyboardAwareScroll from '../components/KeyboardAwareScroll';
import { SuccessOverlay } from '../components/SuccessCheck';

type Nav = NativeStackNavigationProp<RootStackParamList, 'AddDevice'>;
const MAC_LENGTH = 17;

const STEPS = [
  'Flash the rover firmware and open the serial monitor at 115200 baud.',
  'Reset the board — the MAC prints on the first line after boot.',
  'Copy those six byte pairs in here; the colons are added for you.',
];

export default function AddDeviceScreen() {
  const nav = useNavigation<Nav>();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [name, setName] = useState('');
  const [mac, setMac] = useState('');
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [nameError, setNameError] = useState('');
  const [macError, setMacError] = useState('');

  const formatMac = (val: string) => {
    const cleaned = val.replace(/[^A-Fa-f0-9]/g, '').toUpperCase().slice(0, 12);
    return cleaned.match(/.{1,2}/g)?.join(':') ?? '';
  };

  const macComplete = mac.length === MAC_LENGTH;

  const handleAdd = async () => {
    setNameError('');
    setMacError('');

    if (!name.trim()) {
      setNameError('Give this rover a name');
      return;
    }
    if (!macComplete) {
      setMacError('A MAC address is six byte pairs');
      return;
    }

    setLoading(true);
    try {
      const label = name.trim();
      await devicesApi.add({ name: label, macAddress: mac });
      toast.success(`${label} is paired and ready to drive`);
      // The overlay plays the check and calls goBack when it finishes; under
      // reduced motion it resolves immediately and the toast carries the news.
      setCelebrating(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'Could not register that rover');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="New rover" subtitle="Pair an ESP32" onBack={() => nav.goBack()} />

      <KeyboardAwareScroll
        contentContainerStyle={{
          padding: rem(spacing.xl),
          paddingBottom: insets.bottom + rem(spacing.xxl),
          flexGrow: 1,
        }}
      >
          <FadeIn index={0} style={{ gap: rem(18) }}>
            <Field
              label="Device name"
              value={name}
              onChangeText={(t) => { setName(t); if (nameError) setNameError(''); }}
              placeholder="North block scout"
              autoCapitalize="words"
              error={nameError}
            />

            <Field
              label="MAC address"
              value={mac}
              onChangeText={(v) => { setMac(formatMac(v)); if (macError) setMacError(''); }}
              placeholder="A0:B7:65:2C:1D:E4"
              autoCapitalize="characters"
              maxLength={MAC_LENGTH}
              mono
              error={macError}
              hint={macComplete ? undefined : `${Math.floor(mac.replace(/:/g, '').length / 2)} of 6 byte pairs`}
              right={
                macComplete ? (
                  <MaterialCommunityIcons name="check-circle" size={rem(20)} color={theme.successTint} />
                ) : null
              }
            />
          </FadeIn>

          <FadeIn
            index={1}
            style={{
              marginTop: rem(spacing.xl),
              backgroundColor: theme.surface,
              borderRadius: radii.xl,
              borderWidth: 1,
              borderColor: theme.border,
              padding: rem(spacing.lg),
              gap: rem(spacing.md),
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.sm) }}>
              <MaterialCommunityIcons name="console" size={rem(16)} color={theme.accentTint} />
              <Text style={{ ...type.bodyStrong, color: theme.text }}>Finding the address</Text>
            </View>

            {STEPS.map((step, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: rem(spacing.md), alignItems: 'flex-start' }}>
                <View
                  style={{
                    width: rem(20), height: rem(20), borderRadius: rem(10),
                    backgroundColor: theme.accentDim, alignItems: 'center', justifyContent: 'center',
                    marginTop: 1,
                  }}
                >
                  <Text style={{ fontSize: rem(11), fontWeight: '700', color: theme.accentTint }}>{i + 1}</Text>
                </View>
                <Text style={{ ...type.caption, color: theme.textDim, flex: 1 }}>{step}</Text>
              </View>
            ))}
          </FadeIn>

          <View style={{ flex: 1, minHeight: rem(spacing.xl) }} />

          <Button
            label="Register rover"
            loading={loading}
            onPress={handleAdd}
            style={{ marginTop: rem(spacing.xxl) }}
          />
      </KeyboardAwareScroll>

      <SuccessOverlay
        visible={celebrating}
        message="Rover paired"
        onDone={() => { setCelebrating(false); nav.goBack(); }}
      />
    </Screen>
  );
}
