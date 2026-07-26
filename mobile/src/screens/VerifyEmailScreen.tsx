import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Nav = NativeStackNavigationProp<RootStackParamList, 'VerifyEmail'>;
const CODE_LENGTH = 6;

export default function VerifyEmailScreen() {
  const nav = useNavigation<Nav>();
  const { verifyEmail, sendVerification, logout } = useAuth();
  const { theme } = useTheme();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    setTimeout(() => inputRefs.current[0]?.focus(), 300);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(-1);
    const updated = [...digits];
    updated[index] = cleaned;
    setDigits(updated);
    if (cleaned && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (updated.every(d => d !== '') && cleaned) {
      handleVerify(updated.join(''));
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code?: string) => {
    const finalCode = code ?? digits.join('');
    if (finalCode.length < CODE_LENGTH) {
      Alert.alert('', 'Enter the full 6-digit code');
      return;
    }
    setLoading(true);
    try {
      await verifyEmail(finalCode);
      // On success, AuthContext sets user → navigation happens automatically
    } catch (e: any) {
      Alert.alert('Invalid code', e.message || 'Try again');
      setDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await sendVerification();
      setSecondsLeft(60);
      Alert.alert('Code sent', 'Check your email for the new verification code');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to resend');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Animated.View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center', opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        {/* Icon */}
        <Animated.View style={{ alignSelf: 'center', marginBottom: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: theme.primary + '18', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: theme.primary + '30' }}>
            <MaterialCommunityIcons name="shield-check-outline" size={38} color={theme.primary} />
          </View>
        </Animated.View>

        <Text style={{ fontSize: 28, fontWeight: '700', color: theme.text, letterSpacing: -0.5, textAlign: 'center' }}>Verify email</Text>
        <Text style={{ fontSize: 14, color: theme.textDim, marginTop: 10, marginBottom: 36, textAlign: 'center', lineHeight: 22 }}>
          Enter the 6-digit code sent to your email
        </Text>

        {/* Code boxes */}
        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 36 }}>
          {digits.map((digit, i) => (
            <View key={i} style={{ width: 46, height: 56, borderRadius: 14, borderWidth: 2, borderColor: digit ? theme.primary : theme.border, backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center' }}>
              <TextInput
                ref={ref => { inputRefs.current[i] = ref; }}
                style={{ fontSize: 22, fontWeight: '700', color: theme.text, textAlign: 'center', width: '100%', height: '100%' }}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={text => handleChange(text, i)}
                onKeyPress={e => handleKeyPress(e, i)}
                caretHidden
              />
            </View>
          ))}
        </View>

        {/* Verify button */}
        <TouchableOpacity
          onPress={() => handleVerify()}
          disabled={loading || digits.some(d => !d)}
          activeOpacity={0.85}
          style={{ borderRadius: 14, overflow: 'hidden', opacity: digits.some(d => !d) ? 0.5 : 1 }}
        >
          <LinearGradient colors={[theme.primary, theme.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 14 }}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Verify account</Text>
            }
          </LinearGradient>
        </TouchableOpacity>

        {/* Resend */}
        <TouchableOpacity
          onPress={handleResend}
          disabled={resending || secondsLeft > 0}
          style={{ marginTop: 24, alignItems: 'center', opacity: secondsLeft > 0 ? 0.5 : 1 }}
        >
          <Text style={{ fontSize: 13, color: theme.textDim }}>
            {resending ? 'Sending...' : secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={logout} style={{ marginTop: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: theme.textMuted }}>← Back to sign in</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
