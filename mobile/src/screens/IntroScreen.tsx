import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
const R = 12;

type Nav = NativeStackNavigationProp<RootStackParamList, 'Intro'>;

export default function IntroScreen() {
  const nav = useNavigation<Nav>();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const btnAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 1400, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();

    setTimeout(() => {
      Animated.spring(btnAnim, { toValue: 1, friction: 6, tension: 40, useNativeDriver: Platform.OS !== 'web' }).start();
    }, 1600);
  }, []);

  return (
    <LinearGradient colors={['#050508', '#0a0a14', '#050508']} style={styles.container}>
      <View style={styles.orbTop}>
        <LinearGradient colors={['rgba(0,230,255,0.12)', 'transparent']} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.orbBottom}>
        <LinearGradient colors={['rgba(124,58,237,0.1)', 'transparent']} style={StyleSheet.absoluteFill} />
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <View style={styles.iconOuter}>
            <LinearGradient colors={['rgba(0,230,255,0.1)', 'rgba(124,58,237,0.1)']} style={styles.iconOuterGrad}>
              <View style={styles.iconInner}>
                <LinearGradient colors={['#00e6ff', '#7c3aed']} style={styles.iconGrad}>
                  <Text style={styles.iconText}>R</Text>
                </LinearGradient>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>

        <Text style={styles.title}>Rover Control</Text>
        <Text style={styles.subtitle}>ESP32 Command Center</Text>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <View style={styles.dividerDot} />
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.features}>
          {['Real-time WebSocket control', 'Cluster management', 'Ultra-low latency'].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[styles.bottomArea, { opacity: btnAnim, transform: [{ translateY: btnAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
        <TouchableOpacity style={styles.button} onPress={() => nav.navigate('Login')} activeOpacity={0.9}>
          <LinearGradient colors={['#00e6ff', '#7c3aed']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGrad}>
            <Text style={styles.buttonText}>Get started</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => nav.navigate('Signup')}>
          <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkAccent}>Create one</Text></Text>
        </TouchableOpacity>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  orbTop: { position: 'absolute', top: '8%', left: -80, width: 250, height: 250, borderRadius: 125 },
  orbBottom: { position: 'absolute', bottom: '10%', right: -60, width: 200, height: 200, borderRadius: 100 },
  content: { alignItems: 'center', paddingHorizontal: 40 },
  iconOuter: { marginBottom: 28, borderRadius: 28, padding: 3 },
  iconOuterGrad: { borderRadius: 28, padding: 3 },
  iconInner: { borderRadius: 20, overflow: 'hidden' },
  iconGrad: { width: 88, height: 88, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  iconText: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -2 },
  title: { fontSize: 40, fontWeight: '700', color: '#FFF7ED', letterSpacing: -1 },
  subtitle: { fontSize: 13, color: 'rgba(255,247,237,0.4)', marginTop: 10, letterSpacing: 5, textTransform: 'uppercase' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 32, width: '60%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#00e6ff', marginHorizontal: 12 },
  features: { alignItems: 'flex-start', width: '100%', paddingHorizontal: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  featureDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#00e6ff', marginRight: 14 },
  featureText: { fontSize: 14, color: 'rgba(255,247,237,0.7)', letterSpacing: 0.5 },
  bottomArea: { position: 'absolute', bottom: 50, alignItems: 'center', width: '100%', paddingHorizontal: 24 },
  button: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  buttonGrad: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff', letterSpacing: 0.3 },
  linkText: { fontSize: 13, color: 'rgba(255,247,237,0.4)', marginTop: 16 },
  linkAccent: { color: '#00e6ff', fontWeight: '600' },
});
