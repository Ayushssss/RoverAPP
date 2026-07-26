import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Animated, StatusBar, Image, PixelRatio, useWindowDimensions, RefreshControl, Platform,
  NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { devices as devicesApi, stats as statsApi } from '../services/api';
import DropdownMenu from '../components/DropdownMenu';

const { width: SCREEN_W } = Dimensions.get('window');
const scale = SCREEN_W / 390;
const rem = (size: number) => Math.round(PixelRatio.roundToNearestPixel(size * Math.min(scale, 1.35)));
const PAD = rem(20);
const GAP = rem(10);

interface Device { id: string; name: string; mac_address: string; created_at: string; }

const CARD = { radius: 14, pad: rem(14) };

function PulseDot({ color, size: dotSize }: { color: string; size: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ width: dotSize, height: dotSize, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color, opacity: pulse }} />
      <Animated.View style={{ position: 'absolute', width: dotSize * 2.2, height: dotSize * 2.2, borderRadius: dotSize * 1.1, borderWidth: 1.5, borderColor: color, opacity: pulse }} />
    </View>
  );
}

function ScalePress({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: Platform.OS !== 'web', speed: 50, bounciness: 4 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 50, bounciness: 4 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity onPress={onPress} activeOpacity={1} onPressIn={pressIn} onPressOut={pressOut}>{children}</TouchableOpacity>
    </Animated.View>
  );
}

function ShimmerBlock({ width, height, radius }: { width: number; height: number; radius?: number }) {
  const { isDark } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const bgColor = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: isDark ? ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.10)'] : ['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.10)'],
  });
  return <Animated.View style={{ width, height, borderRadius: radius ?? 12, backgroundColor: bgColor }} />;
}

function SectionHeader({ title, accent }: { title: string; accent?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(8), paddingHorizontal: PAD, marginTop: rem(18), marginBottom: rem(8) }}>
      <View style={{ width: rem(3), height: rem(14), borderRadius: rem(1.5), backgroundColor: accent || theme.primary }} />
      <Text style={{ fontSize: rem(16), fontWeight: '700', color: theme.text }}>{title}</Text>
    </View>
  );
}

function FadeUpSection({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web', delay: delay * 50 }),
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 40, useNativeDriver: Platform.OS !== 'web', delay: delay * 50 }),
      ]).start();
    }, 100);
    return () => clearTimeout(t);
  }, []);
  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { height: winH, width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [devices, setDevices] = useState<Device[]>([]);
  const [statsData, setStatsData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fetching, setFetching] = useState(true);

  const landscape = winW > winH;
  const heroH = Math.min(winH * (landscape ? 0.42 : 0.33), landscape ? 280 : 310);

  const scrollY = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;
  const analyticsScroll = useRef<ScrollView>(null);
  const [analyticsPage, setAnalyticsPage] = useState(0);

  const totalDevices = statsData?.total || 0;
  const activeDevices = statsData?.active || 0;
  const clustersCount = statsData?.clustersCount || 0;
  const healthScore = statsData?.healthScore ?? (totalDevices > 0 ? 100 : 0);

  const analyticsData = [
    { icon: 'router-wireless', val: `${totalDevices}`, label: 'Total rovers', sub: `${clustersCount} clusters`, color: theme.primary },
    { icon: 'signal-cellular-3', val: `${activeDevices}`, label: 'Currently active', sub: totalDevices > 0 ? `${Math.round((activeDevices / totalDevices) * 100)}% online rate` : 'No devices', color: '#2A9D8F' },
    { icon: 'chart-arc', val: `${healthScore}%`, label: 'Fleet health score', sub: 'Based on uptime & activity', color: '#C86A45' },
  ];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(slideUp, { toValue: 0, friction: 8, tension: 40, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, []);

  useEffect(() => {
    if (analyticsData.length < 2) return;
    const interval = setInterval(() => {
      const next = (analyticsPage + 1) % analyticsData.length;
      analyticsScroll.current?.scrollTo({ x: next * (winW - PAD * 2), animated: true });
      setAnalyticsPage(next);
    }, 3500);
    return () => clearInterval(interval);
  }, [analyticsPage, analyticsData.length, winW]);

  const handleAnalyticsScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / (winW - PAD * 2));
    setAnalyticsPage(page);
  }, [winW]);

  const quickActions = [
    { icon: 'plus-circle', label: 'Add Rover', screen: 'AddDevice' as const, colors: ['#D4A53A', '#B8860B'] as const },
    { icon: 'robot', label: 'Fleet', screen: 'Rovers' as const, colors: ['#2A9D8F', '#1E7A6F'] as const },
    { icon: 'sitemap', label: 'Clusters', screen: 'Clusters' as const, colors: ['#C86A45', '#A8553A'] as const },
  ];

  const scrollEvent = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  const heroParallax = scrollY.interpolate({
    inputRange: [-heroH, 0, heroH],
    outputRange: [-heroH * 0.3, 0, heroH * 0.15],
    extrapolate: 'clamp',
  });

  const heroFade = scrollY.interpolate({
    inputRange: [0, heroH * 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const heroSlide = scrollY.interpolate({
    inputRange: [0, heroH * 0.4],
    outputRange: [0, -16],
    extrapolate: 'clamp',
  });

  const headerFade = scrollY.interpolate({
    inputRange: [0, heroH * 0.6],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const renderRoverSkeleton = () => (
    <View style={{ marginHorizontal: PAD, gap: rem(7) }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ padding: CARD.pad, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, borderRadius: CARD.radius, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(12) }}>
            <ShimmerBlock width={rem(44)} height={rem(44)} radius={12} />
            <View style={{ gap: rem(6) }}>
              <ShimmerBlock width={rem(100)} height={rem(12)} radius={6} />
              <ShimmerBlock width={rem(70)} height={rem(10)} radius={5} />
            </View>
          </View>
          <ShimmerBlock width={rem(18)} height={rem(18)} radius={9} />
        </View>
      ))}
    </View>
  );

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([devicesApi.list(), statsApi.get()]);
      setDevices(d || []);
      setStatsData(s || null);
    } catch (e) { console.warn('fetch err', e); }
    finally { setFetching(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <ScrollView
        onScroll={scrollEvent}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + rem(90) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Hero */}
        <Animated.View style={{ height: heroH, backgroundColor: theme.surfaceElevated, transform: [{ translateY: heroParallax }] }}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1000&q=85' }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient colors={[isDark ? 'rgba(11,15,28,0.7)' : 'rgba(255,248,240,0.55)', isDark ? 'rgba(11,15,28,0.95)' : 'rgba(255,248,240,0.95)']} style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1 }}>
              <Animated.View style={{ paddingTop: insets.top + 4, paddingHorizontal: PAD, paddingBottom: rem(4), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: headerFade }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(8) }}>
                  <LinearGradient colors={[theme.primary, theme.primary + '80']} style={{ width: rem(10), height: rem(10), borderRadius: rem(5) }} />
                  <Text style={{ fontSize: rem(12), fontWeight: '700', color: theme.text, letterSpacing: 2, opacity: 0.8 }}>AGRIVERSE</Text>
                </View>
                <DropdownMenu />
              </Animated.View>
              <Animated.View style={{ paddingHorizontal: PAD, paddingTop: rem(18), opacity: Animated.multiply(fadeIn, heroFade), transform: [{ translateY: slideUp }, { translateY: heroSlide }] }}>
                <View style={{ alignSelf: 'flex-start', backgroundColor: theme.primary + '20', paddingHorizontal: rem(10), paddingVertical: rem(3), borderRadius: 999, borderWidth: 1, borderColor: theme.primary + '30', marginBottom: rem(6) }}>
                  <Text style={{ fontSize: rem(8), fontWeight: '700', color: theme.primary, letterSpacing: 1.5 }}>FARM OS v2.4</Text>
                </View>
                <Text style={{ fontSize: rem(landscape ? 22 : 28), fontWeight: '700', color: theme.text, lineHeight: rem(landscape ? 28 : 34), marginBottom: rem(3) }}>
                  {landscape ? 'Your farm, intelligently managed.' : `Your farm,\nintelligently managed.`}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(8) }}>
                  <PulseDot color={activeDevices > 0 ? theme.primary : theme.textMuted} size={rem(7)} />
                  <Text style={{ fontSize: rem(12), color: theme.textDim }}>{activeDevices} of {totalDevices} rovers online</Text>
                </View>
              </Animated.View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Quick Stats */}
        <FadeUpSection delay={0} style={{ flexDirection: 'row', paddingHorizontal: PAD, marginTop: -rem(20), gap: GAP }}>
          <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: CARD.radius, padding: rem(12), borderWidth: 1, borderColor: theme.border }}>
            <View style={{ width: rem(32), height: rem(32), borderRadius: rem(10), backgroundColor: theme.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: rem(8) }}>
              <MaterialCommunityIcons name="signal-cellular-3" size={rem(16)} color={theme.primary} />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: rem(18), fontWeight: '700', color: theme.text, letterSpacing: -0.3 }} numberOfLines={1}>
                {activeDevices}<Text style={{ fontSize: rem(11), fontWeight: '400', color: theme.textDim }}> of {totalDevices}</Text>
              </Text>
            </View>
            <Text style={{ fontSize: rem(9), color: theme.textDim, letterSpacing: 0.3, marginTop: rem(2) }} numberOfLines={1}>Active rovers</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: CARD.radius, padding: rem(12), borderWidth: 1, borderColor: theme.border }}>
            <View style={{ width: rem(32), height: rem(32), borderRadius: rem(10), backgroundColor: '#2A9D8F15', justifyContent: 'center', alignItems: 'center', marginBottom: rem(8) }}>
              <MaterialCommunityIcons name="sitemap-outline" size={rem(16)} color="#2A9D8F" />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: rem(18), fontWeight: '700', color: theme.text, letterSpacing: -0.3 }} numberOfLines={1}>
                {clustersCount}<Text style={{ fontSize: rem(11), fontWeight: '400', color: theme.textDim }}> groups</Text>
              </Text>
            </View>
            <Text style={{ fontSize: rem(9), color: theme.textDim, letterSpacing: 0.3, marginTop: rem(2) }} numberOfLines={1}>Clusters</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: CARD.radius, padding: rem(12), borderWidth: 1, borderColor: theme.border }}>
            <View style={{ width: rem(32), height: rem(32), borderRadius: rem(10), backgroundColor: '#D4A53A15', justifyContent: 'center', alignItems: 'center', marginBottom: rem(8) }}>
              <MaterialCommunityIcons name="heart-pulse" size={rem(16)} color="#D4A53A" />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: rem(18), fontWeight: '700', color: theme.text, letterSpacing: -0.3 }} numberOfLines={1}>
                {healthScore}<Text style={{ fontSize: rem(11), fontWeight: '400', color: theme.textDim }}>%</Text>
              </Text>
            </View>
            <Text style={{ fontSize: rem(9), color: theme.textDim, letterSpacing: 0.3, marginTop: rem(2) }} numberOfLines={1}>Health</Text>
          </View>
        </FadeUpSection>

        {/* Quick Actions */}
        <FadeUpSection delay={1}>
          <SectionHeader title="Quick Actions" accent={theme.primary} />
          <View style={{ flexDirection: 'row', paddingHorizontal: PAD, gap: GAP }}>
            {quickActions.slice(0, winW > 480 ? 3 : 2).map((x, i) => (
              <ScalePress key={i} onPress={() => nav.navigate(x.screen)} style={{ flex: 1, borderRadius: CARD.radius }}>
                <LinearGradient colors={x.colors} style={{ padding: rem(16), alignItems: 'center', gap: rem(6), borderRadius: CARD.radius }}>
                  <MaterialCommunityIcons name={x.icon as any} size={rem(22)} color="#fff" />
                  <Text style={{ fontSize: rem(11), fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>{x.label}</Text>
                </LinearGradient>
              </ScalePress>
            ))}
          </View>
        </FadeUpSection>

        {/* Rovers */}
        <FadeUpSection delay={2}>
          <SectionHeader title="Your Rovers" />
          {fetching ? (
            renderRoverSkeleton()
          ) : devices.length === 0 ? (
            <ScalePress onPress={() => nav.navigate('AddDevice')} style={{ marginHorizontal: PAD }}>
              <View style={{ padding: rem(28), backgroundColor: theme.surface, borderRadius: CARD.radius, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', alignItems: 'center', gap: rem(8) }}>
                <View style={{ width: rem(48), height: rem(48), borderRadius: rem(14), backgroundColor: theme.primary + '12', justifyContent: 'center', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="plus-circle-outline" size={rem(26)} color={theme.primary} />
                </View>
                <Text style={{ fontSize: rem(13), color: theme.textDim }}>No rovers yet — tap to add one</Text>
              </View>
            </ScalePress>
          ) : (
            <View style={{ paddingHorizontal: PAD, gap: rem(7) }}>
              {devices.slice(0, 3).map((r) => (
                <ScalePress key={r.id} onPress={() => nav.navigate('Control', { deviceId: r.name, deviceName: r.name, macAddress: r.mac_address })}>
                  <View style={{ padding: CARD.pad, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.surface, borderRadius: CARD.radius, borderWidth: 1, borderColor: theme.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(12) }}>
                      <View style={{ width: rem(44), height: rem(44), borderRadius: rem(12), backgroundColor: theme.primary + '15', justifyContent: 'center', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="robot-outline" size={rem(22)} color={theme.primary} />
                      </View>
                      <View style={{ flexShrink: 1 }}>
                        <Text style={{ fontSize: rem(14), fontWeight: '600', color: theme.text }} numberOfLines={1}>{r.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(6), marginTop: rem(3) }}>
                          <PulseDot color={theme.primary} size={rem(5)} />
                          <Text style={{ fontSize: rem(10), color: theme.textDim }}>Online</Text>
                          <Text style={{ fontSize: rem(9), color: theme.textMuted }} numberOfLines={1}>{r.mac_address.slice(-5)}</Text>
                        </View>
                      </View>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={rem(18)} color={theme.textMuted} />
                  </View>
                </ScalePress>
              ))}
            </View>
          )}
        </FadeUpSection>

        {/* Analytics Carousel */}
        {analyticsData.length > 0 && (
          <FadeUpSection delay={3}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: PAD, marginTop: rem(18), marginBottom: rem(8) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(8) }}>
                <View style={{ width: rem(3), height: rem(14), borderRadius: rem(1.5), backgroundColor: '#2A9D8F' }} />
                <Text style={{ fontSize: rem(16), fontWeight: '700', color: theme.text }}>Analytics</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: rem(5) }}>
                {analyticsData.map((_, i) => (
                  <View key={i} style={{ width: rem(6), height: rem(6), borderRadius: rem(3), backgroundColor: i === analyticsPage ? theme.primary : theme.textMuted, opacity: i === analyticsPage ? 1 : 0.4 }} />
                ))}
              </View>
            </View>
            <ScrollView
              ref={analyticsScroll}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleAnalyticsScroll}
              snapToInterval={winW - PAD * 2}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: PAD }}
            >
              {analyticsData.map((x, i) => (
                <View key={i} style={{ width: winW - PAD * 2 }}>
                  <LinearGradient colors={[x.color + '18', x.color + '06']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: CARD.radius, borderWidth: 1, borderColor: theme.border, padding: rem(16), flexDirection: 'row', alignItems: 'center', gap: rem(14), marginRight: GAP }}>
                    <View style={{ width: rem(44), height: rem(44), borderRadius: rem(12), backgroundColor: x.color + '20', justifyContent: 'center', alignItems: 'center' }}>
                      <MaterialCommunityIcons name={x.icon as any} size={rem(20)} color={x.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: rem(26), fontWeight: '700', color: theme.text, letterSpacing: -0.5 }}>{x.val}</Text>
                      <Text style={{ fontSize: rem(11), color: theme.textDim, marginTop: rem(2) }}>{x.label}</Text>
                      <Text style={{ fontSize: rem(9), color: theme.textMuted, marginTop: rem(2) }}>{x.sub}</Text>
                    </View>
                  </LinearGradient>
                </View>
              ))}
            </ScrollView>
          </FadeUpSection>
        )}

        <View style={{ height: rem(20) }} />
      </ScrollView>
    </View>
  );
}
