import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Animated,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;

const CODE_LENGTH = 6;

function StepDots({ current, total, theme }: { current: number; total: number; theme: any }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{
          width: i === current ? 28 : 8, height: 8, borderRadius: 4,
          backgroundColor: i <= current ? theme.primary : theme.border,
        }} />
      ))}
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const nav = useNavigation<Nav>();
  const { forgotPassword, verifyResetCode, resetPassword } = useAuth();
  const { theme } = useTheme();
  const { height: winH } = useWindowDimensions();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, []);

  const handleSendCode = async () => {
    if (!email) { Alert.alert('', 'Enter your email address'); return; }
    setLoading(true);
    try {
      await forgotPassword(email);
      setStep(2);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send reset code');
    } finally { setLoading(false); }
  };

  const handleVerifyCode = async () => {
    if (code.length < CODE_LENGTH) { Alert.alert('', 'Enter the full 6-digit code'); return; }
    setLoading(true);
    try {
      await verifyResetCode(code);
      setStep(3);
    } catch (e: any) {
      Alert.alert('Invalid code', e.message || 'Try again');
    } finally { setLoading(false); }
  };

  const handleReset = async () => {
    setPwError('');
    if (newPassword.length < 8) { setPwError('Minimum 8 characters required'); return; }
    setLoading(true);
    try {
      await resetPassword(newPassword);
      Alert.alert('Password reset', 'Your password has been updated. You can now sign in.', [
        { text: 'OK', onPress: () => nav.navigate('Login') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reset password');
    } finally { setLoading(false); }
  };

  const content = (
    <View style={{ paddingTop: winH * 0.14, paddingHorizontal: 24 }}>
      <TouchableOpacity onPress={() => nav.goBack()} style={{ marginBottom: 24, alignSelf: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.text} />
        </View>
      </TouchableOpacity>

      <StepDots current={step - 1} total={3} theme={theme} />

      <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: theme.accentDim, justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
        <MaterialCommunityIcons
          name={step === 1 ? 'lock-reset' : step === 2 ? 'shield-check-outline' : 'key-change'}
          size={28} color={theme.accent}
        />
      </View>

      {step === 1 && (
        <View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text, letterSpacing: -0.5, lineHeight: 34 }}>Reset password</Text>
          <Text style={{ fontSize: 14, color: theme.textDim, marginTop: 8, marginBottom: 32, lineHeight: 20 }}>
            Enter your email and we'll send a 6-digit code.
          </Text>
          <View style={{ backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border, borderRadius: 14, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 12 }}>
            <Text style={{ position: 'absolute', top: 7, left: 16, fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 1.5 }}>Email</Text>
            <TextInput
              style={{ fontSize: 16, color: theme.text, padding: 0, margin: 0 }}
              value={email} onChangeText={setEmail}
              placeholder="you@example.com" placeholderTextColor={theme.textMuted}
              autoCapitalize="none" keyboardType="email-address"
            />
          </View>
          <TouchableOpacity style={{ marginTop: 28, borderRadius: 16, overflow: 'hidden' }} onPress={handleSendCode} disabled={loading} activeOpacity={0.85}>
            <LinearGradient colors={[theme.primary, theme.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 16 }}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Send code</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {step === 2 && (
        <View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text, letterSpacing: -0.5, lineHeight: 34 }}>Check email</Text>
          <Text style={{ fontSize: 14, color: theme.textDim, marginTop: 8, marginBottom: 32, lineHeight: 20 }}>
            Enter the 6-digit code sent to {email}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <View key={i} style={{
                width: 46, height: 56, borderRadius: 14, borderWidth: 2,
                borderColor: code[i] ? theme.primary : theme.border,
                backgroundColor: theme.surface, justifyContent: 'center', alignItems: 'center',
              }}>
                <TextInput
                  style={{ fontSize: 22, fontWeight: '700', color: theme.text, textAlign: 'center', width: '100%', height: '100%' }}
                  keyboardType="number-pad" maxLength={1}
                  value={code[i] || ''}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9]/g, '').slice(-1);
                    const updated = code.split('');
                    updated[i] = cleaned;
                    setCode(updated.join(''));
                  }}
                  caretHidden
                />
              </View>
            ))}
          </View>
          <TouchableOpacity style={{ marginTop: 4, borderRadius: 16, overflow: 'hidden' }} onPress={handleVerifyCode} disabled={loading || code.length < CODE_LENGTH} activeOpacity={0.85}>
            <LinearGradient colors={[theme.primary, theme.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 16, opacity: code.length < CODE_LENGTH ? 0.5 : 1 }}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Verify code</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {step === 3 && (
        <View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: theme.text, letterSpacing: -0.5, lineHeight: 34 }}>New password</Text>
          <Text style={{ fontSize: 14, color: theme.textDim, marginTop: 8, marginBottom: 32, lineHeight: 20 }}>
            Choose a strong password (minimum 8 characters).
          </Text>
          <View style={{
            backgroundColor: theme.surface, borderWidth: 1.5,
            borderColor: pwError ? theme.error : theme.border,
            borderRadius: 14, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 12,
          }}>
            <Text style={{ position: 'absolute', top: 7, left: 16, fontSize: 10, color: pwError ? theme.error : theme.textMuted, textTransform: 'uppercase', letterSpacing: 1.5 }}>New Password</Text>
            <TextInput
              style={{ fontSize: 16, color: theme.text, padding: 0, margin: 0 }}
              value={newPassword} onChangeText={(t) => { setNewPassword(t); if (pwError) setPwError(''); }}
              placeholder="Minimum 8 characters" placeholderTextColor={theme.textMuted}
              secureTextEntry
            />
          </View>
          {pwError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.error} />
              <Text style={{ fontSize: 12, color: theme.error }}>{pwError}</Text>
            </View>
          ) : newPassword.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: theme.border, overflow: 'hidden' }}>
                <View style={{
                  width: `${Math.min(100, (newPassword.length / 8) * 100)}%`,
                  height: '100%', borderRadius: 2,
                  backgroundColor: newPassword.length >= 8 ? theme.success : theme.accent,
                }} />
              </View>
              <Text style={{ fontSize: 11, color: newPassword.length >= 8 ? theme.success : theme.textDim }}>
                {newPassword.length}/8
              </Text>
            </View>
          ) : null}
          <TouchableOpacity style={{ marginTop: 28, borderRadius: 16, overflow: 'hidden' }} onPress={handleReset} disabled={loading} activeOpacity={0.85}>
            <LinearGradient colors={[theme.primary, theme.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 16 }}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>Reset password</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <LinearGradient colors={[theme.bg, theme.surface, theme.bg]} locations={[0, 0.5, 1]} style={{ position: 'absolute', inset: 0 }} />
      <View style={{ position: 'absolute', top: -100, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: theme.accentDim, opacity: 0.25 }} />
      <View style={{ position: 'absolute', bottom: -60, left: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: theme.primaryDim, opacity: 0.2 }} />
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {content}
          </Animated.View>
        </KeyboardAvoidingView>
      ) : (
        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {content}
        </Animated.View>
      )}
    </View>
  );
}
