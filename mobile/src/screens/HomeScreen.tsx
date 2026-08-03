import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, StatusBar,
  useWindowDimensions, RefreshControl,
  NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
  interpolate, Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { devices as devicesApi, clusters as clustersApi, stats as statsApi } from '../services/api';
import DropdownMenu from '../components/DropdownMenu';
import { rem, spacing, radii, type, fonts } from '../theme';
import { imagery, IMAGE_TRANSITION_MS } from '../media';
import { relativeTime, greeting, plural } from '../utils/time';
import {
  Press, FadeIn, PulseDot, SectionHeader, Badge, EmptyState, Card,
  Collapsible, MetricBar,
} from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { FurrowArt } from '../components/Illustrations';
import AnimatedNumber from '../components/AnimatedNumber';
import Glass from '../components/Glass';

const PAD = rem(spacing.xl);
const GAP = rem(spacing.md);

interface Device {
  id: string;
  name: string;
  mac_address: string;
  cluster_id: string | null;
  created_at: string;
}
interface Cluster { id: string; name: string; description: string; created_at: string }

type Activity = { id: string; kind: 'rover' | 'cluster'; label: string; at: string };

export default function HomeScreen() {
  const nav = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { height: winH, width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [devices, setDevices] = useState<Device[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [statsData, setStatsData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fetching, setFetching] = useState(true);

  const landscape = winW > winH;
  const heroH = Math.min(winH * (landscape ? 0.46 : 0.34), landscape ? 300 : 320);
  const cardW = winW - PAD * 2;

  const scrollY = useSharedValue(0);
  const analyticsScroll = useRef<ScrollView>(null);
  const [analyticsPage, setAnalyticsPage] = useState(0);

  const total = statsData?.total ?? devices.length;
  const active = statsData?.active ?? 0;
  const clusterCount = clusters.length;
  const healthScore = statsData?.healthScore ?? 0;
  const onlineRate = total > 0 ? Math.round((active / total) * 100) : 0;

  /* ── Everything below is derived from real records, never invented ── */

  const assigned = useMemo(() => devices.filter((d) => d.cluster_id).length, [devices]);
  const unassigned = Math.max(devices.length - assigned, 0);

  const byCluster = useMemo(() => {
    const counts = new Map<string, number>();
    devices.forEach((d) => {
      if (d.cluster_id) counts.set(d.cluster_id, (counts.get(d.cluster_id) ?? 0) + 1);
    });
    return clusters
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }, [devices, clusters]);

  const newest = useMemo(
    () => [...devices].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0],
    [devices]
  );

  const activity = useMemo<Activity[]>(() => {
    const rovers: Activity[] = devices.map((d) => ({
      id: `d-${d.id}`, kind: 'rover', label: d.name, at: d.created_at,
    }));
    const groups: Activity[] = clusters.map((c) => ({
      id: `c-${c.id}`, kind: 'cluster', label: c.name, at: c.created_at,
    }));
    return [...rovers, ...groups]
      .filter((a) => !!a.at)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 8);
  }, [devices, clusters]);

  /** Only surfaces when there is genuinely something to act on. */
  const attention = useMemo(() => {
    if (devices.length === 0) return null;
    if (unassigned > 0) {
      return {
        icon: 'shape-outline' as const,
        title: `${plural(unassigned, 'rover')} ungrouped`,
        body: clusterCount === 0
          ? 'Create a cluster to command them together.'
          : 'Assign them to a cluster to drive them as one.',
        cta: clusterCount === 0 ? 'Create cluster' : 'Open clusters',
        onPress: () => nav.navigate('Clusters'),
      };
    }
    return null;
  }, [devices.length, unassigned, clusterCount, nav]);

  const analytics = [
    {
      icon: 'router-wireless' as const,
      figure: total,
      format: (n: number) => `${n}`,
      label: 'Rovers registered',
      sub: clusterCount > 0 ? `Across ${plural(clusterCount, 'cluster')}` : 'Not grouped yet',
      color: theme.primaryTint,
    },
    {
      icon: 'access-point' as const,
      figure: onlineRate,
      format: (n: number) => `${n}%`,
      label: 'Online rate',
      sub: total > 0 ? `${active} of ${total} reachable` : 'Waiting on first pairing',
      color: theme.successTint,
    },
    {
      icon: 'heart-pulse' as const,
      figure: healthScore,
      format: (n: number) => `${n}%`,
      label: 'Fleet health',
      sub: 'Weighted by uptime and command success',
      color: theme.accentTint,
    },
  ];

  useEffect(() => {
    if (analytics.length < 2) return;
    const timer = setInterval(() => {
      const next = (analyticsPage + 1) % analytics.length;
      analyticsScroll.current?.scrollTo({ x: next * cardW, animated: true });
      setAnalyticsPage(next);
    }, 4600);
    return () => clearInterval(timer);
  }, [analyticsPage, analytics.length, cardW]);

  const handleAnalyticsScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setAnalyticsPage(Math.round(e.nativeEvent.contentOffset.x / cardW));
    },
    [cardW]
  );

  const load = useCallback(async () => {
    try {
      const [d, c, s] = await Promise.all([devicesApi.list(), clustersApi.list(), statsApi.get()]);
      setDevices((d as Device[]) || []);
      setClusters((c as Cluster[]) || []);
      setStatsData(s || null);
    } catch (e) {
      console.warn('home: fetch failed', e);
    } finally {
      setFetching(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          scrollY.value, [-heroH, 0, heroH],
          [-heroH * 0.28, 0, heroH * 0.18], Extrapolation.CLAMP
        ),
      },
      { scale: interpolate(scrollY.value, [-heroH, 0], [1.25, 1], Extrapolation.CLAMP) },
    ],
  }));

  const heroContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, heroH * 0.55], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [0, heroH * 0.55], [0, -20], Extrapolation.CLAMP) },
    ],
  }));

  const quickActions = [
    { icon: 'plus' as const, label: 'Add rover', screen: 'AddDevice', tone: theme.primary, fg: theme.primaryOn },
    { icon: 'robot-outline' as const, label: 'Fleet', screen: 'Rovers', tone: theme.surface, fg: theme.text },
    { icon: 'sitemap-outline' as const, label: 'Clusters', screen: 'Clusters', tone: theme.surface, fg: theme.text },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + rem(96) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primaryTint} progressViewOffset={insets.top} />
        }
      >
        {/* ── Hero ─────────────────────────────────────────── */}
        <Animated.View style={[{ height: heroH, backgroundColor: theme.surfaceElevated }, heroStyle]}>
          <Image
            source={imagery.fieldAerial.uri}
            placeholder={{ blurhash: imagery.fieldAerial.blurhash }}
            transition={IMAGE_TRANSITION_MS}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={imagery.fieldAerial.alt}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={
              isDark
                ? ['rgba(11,15,28,0.5)', 'rgba(11,15,28,0.86)', theme.bg]
                : ['rgba(255,248,240,0.4)', 'rgba(255,248,240,0.85)', theme.bg]
            }
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />

          <View style={{ flex: 1, paddingTop: insets.top + rem(spacing.sm), paddingHorizontal: PAD }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.sm) }}>
                <View style={{ width: rem(9), height: rem(9), borderRadius: rem(4.5), backgroundColor: theme.primaryTint }} />
                <Text style={{ ...type.micro, color: theme.text, opacity: 0.85 }}>AGRIVERSE</Text>
              </View>
              <DropdownMenu />
            </View>

            {/* Bottom padding clears the fleet card that overlaps the hero, so
                the headline and status line are never sat on. */}
            <Animated.View style={[{ flex: 1, justifyContent: 'flex-end', paddingBottom: rem(72) }, heroContentStyle]}>
              <Badge label="FARM OS v2.4" />
              <Text
                style={{
                  fontSize: rem(landscape ? 22 : 27),
                  lineHeight: rem(landscape ? 28 : 33),
                  fontWeight: '700',
                  letterSpacing: -0.8,
                  color: theme.text,
                  marginTop: rem(spacing.md),
                  maxWidth: rem(320),
                }}
              >
                {greeting()}. {total > 0 ? 'Your fields are covered.' : 'Let’s get you paired.'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.xs), marginTop: rem(spacing.sm) }}>
                <PulseDot color={active > 0 ? theme.successTint : theme.textMuted} size={rem(6)} />
                <Text style={{ ...type.caption, color: theme.textSecondary }}>
                  {fetching ? 'Checking fleet…' : `${active} of ${total} rovers online`}
                </Text>
              </View>
            </Animated.View>
          </View>
        </Animated.View>

        {/* ── Fleet overview: summary up top, breakdown one tap down ── */}
        {/* Overlaps the hero just enough for the glass to pick up photography
            without covering the hero's own text. */}
        <FadeIn index={0} style={{ paddingHorizontal: PAD, marginTop: -rem(46) }}>
          <Glass radius={radii.xl}>
            <View style={{ padding: rem(spacing.xl), gap: rem(spacing.lg) }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: rem(spacing.md) }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...type.micro, color: theme.textMuted, textTransform: 'uppercase' }}>
                  Fleet status
                </Text>
                {fetching ? (
                  <Skeleton width={rem(120)} height={rem(36)} radius={8} style={{ marginTop: rem(spacing.sm) }} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: rem(2) }}>
                    <AnimatedNumber
                      value={active}
                      style={{
                        fontSize: rem(36), fontWeight: '700', letterSpacing: -1.4, color: theme.text,
                      }}
                    />
                    <Text style={{ fontSize: rem(17), fontWeight: '500', color: theme.textMuted }}>
                      {' '}/ {total} online
                    </Text>
                  </View>
                )}
                {!fetching && !!newest && (
                  <Text style={{ ...type.caption, color: theme.textDim, marginTop: rem(2) }} numberOfLines={1}>
                    Newest: {newest.name} · {relativeTime(newest.created_at)}
                  </Text>
                )}
              </View>

              <View
                style={{
                  alignItems: 'center', justifyContent: 'center',
                  width: rem(56), height: rem(56), borderRadius: rem(28),
                  borderWidth: 3,
                  borderColor: healthScore >= 70 ? theme.successTint : healthScore > 0 ? theme.accent : theme.border,
                }}
              >
                {fetching ? (
                  <Text style={{ fontSize: rem(15), fontWeight: '700', color: theme.text }}>—</Text>
                ) : (
                  <AnimatedNumber
                    value={healthScore}
                    style={{ fontSize: rem(15), fontWeight: '700', color: theme.text }}
                  />
                )}
                <Text style={{ fontSize: rem(8), color: theme.textMuted, letterSpacing: 0.6 }}>HEALTH</Text>
              </View>
            </View>

            {!fetching && devices.length > 0 && (
              <MetricBar
                segments={[
                  { count: assigned, color: theme.primary, label: 'Grouped' },
                  { count: unassigned, color: theme.accent, label: 'Ungrouped' },
                ]}
              />
            )}
            </View>
          </Glass>
        </FadeIn>

        {/* ── Attention: absent unless there's something to fix ── */}
        {!fetching && attention && (
          <FadeIn index={1} style={{ paddingHorizontal: PAD, marginTop: GAP }}>
            <Press onPress={attention.onPress} label={attention.cta}>
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md),
                  padding: rem(spacing.lg),
                  borderRadius: radii.xl,
                  backgroundColor: theme.accentDim,
                  borderWidth: 1,
                  borderColor: theme.accent + '40',
                }}
              >
                <MaterialCommunityIcons name={attention.icon} size={rem(20)} color={theme.accentTint} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ ...type.bodyStrong, color: theme.text }}>{attention.title}</Text>
                  <Text style={{ ...type.caption, color: theme.textDim, marginTop: 1 }}>{attention.body}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={rem(18)} color={theme.textMuted} />
              </View>
            </Press>
          </FadeIn>
        )}

        {/* ── Quick actions ────────────────────────────────── */}
        <FadeIn index={2}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: PAD, gap: rem(spacing.sm), marginTop: rem(spacing.xl) }}
          >
            {quickActions.map((a) => (
              <Press key={a.label} onPress={() => nav.navigate(a.screen)} label={a.label}>
                <View
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: rem(spacing.sm),
                    paddingVertical: rem(11), paddingHorizontal: rem(spacing.lg),
                    borderRadius: radii.full,
                    backgroundColor: a.tone,
                    borderWidth: 1,
                    borderColor: a.tone === theme.surface ? theme.border : 'transparent',
                  }}
                >
                  <MaterialCommunityIcons name={a.icon} size={rem(16)} color={a.fg} />
                  <Text style={{ fontSize: rem(13), fontWeight: '600', color: a.fg }}>{a.label}</Text>
                </View>
              </Press>
            ))}
          </ScrollView>
        </FadeIn>

        {/* ── Rovers: a preview, not the whole list ────────── */}
        <FadeIn index={3} style={{ marginTop: rem(spacing.xxl) }}>
          <SectionHeader
            title="Your rovers"
            style={{ paddingHorizontal: PAD, marginBottom: rem(spacing.md) }}
            right={
              devices.length > 3 ? (
                <Press onPress={() => nav.navigate('Rovers')} label="See all rovers">
                  <Text style={{ ...type.caption, color: theme.primaryTint, fontWeight: '700' }}>
                    All {devices.length}
                  </Text>
                </Press>
              ) : undefined
            }
          />

          {fetching ? (
            <View style={{ paddingHorizontal: PAD, gap: rem(spacing.sm) }}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md),
                    padding: rem(spacing.lg), backgroundColor: theme.surface,
                    borderRadius: radii.xl, borderWidth: 1, borderColor: theme.border,
                  }}
                >
                  <Skeleton width={rem(42)} height={rem(42)} radius={radii.md} delay={i * 90} />
                  <View style={{ flex: 1, gap: rem(6) }}>
                    <Skeleton width="55%" height={rem(13)} radius={6} delay={i * 90 + 60} />
                    <Skeleton width="35%" height={rem(10)} radius={5} delay={i * 90 + 120} />
                  </View>
                </View>
              ))}
            </View>
          ) : devices.length === 0 ? (
            <Card style={{ marginHorizontal: PAD }} dashed padded={false}>
              <EmptyState
                art={<FurrowArt size={rem(168)} />}
                title="No rovers paired"
                body="Register your first ESP32 to start streaming commands to the field."
                actionLabel="Add a rover"
                onAction={() => nav.navigate('AddDevice')}
              />
            </Card>
          ) : (
            <View style={{ paddingHorizontal: PAD, gap: rem(spacing.sm) }}>
              {devices.slice(0, 3).map((r, i) => (
                <FadeIn key={r.id} index={i}>
                  <Press
                    label={`Control ${r.name}`}
                    onPress={() =>
                      nav.navigate('RoverHub', { deviceName: r.name, macAddress: r.mac_address })
                    }
                  >
                    <View
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md),
                        padding: rem(spacing.lg), backgroundColor: theme.surface,
                        borderRadius: radii.xl, borderWidth: 1, borderColor: theme.border,
                      }}
                    >
                      <View
                        style={{
                          width: rem(42), height: rem(42), borderRadius: radii.md,
                          backgroundColor: theme.primaryDim, alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons name="robot-outline" size={rem(21)} color={theme.primaryTint} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ ...type.bodyStrong, color: theme.text }} numberOfLines={1}>{r.name}</Text>
                        <Text
                          style={{ fontFamily: fonts.mono, fontSize: rem(10), color: theme.textMuted, marginTop: 3 }}
                          numberOfLines={1}
                        >
                          {r.mac_address}
                        </Text>
                      </View>
                      <PulseDot color={theme.successTint} size={rem(6)} />
                      <MaterialCommunityIcons name="chevron-right" size={rem(18)} color={theme.textMuted} />
                    </View>
                  </Press>
                </FadeIn>
              ))}
            </View>
          )}
        </FadeIn>

        {/* ── Folded detail ────────────────────────────────── */}
        {!fetching && devices.length > 0 && (
          <FadeIn index={4} style={{ paddingHorizontal: PAD, marginTop: rem(spacing.xxl), gap: rem(spacing.md) }}>
            <Collapsible
              title="Cluster breakdown"
              summary={clusterCount > 0 ? `${plural(clusterCount, 'cluster')} · ${unassigned} ungrouped` : 'No clusters yet'}
              icon="sitemap-outline"
              iconColor={theme.successTint}
            >
              {byCluster.length === 0 ? (
                <Text style={{ ...type.caption, color: theme.textDim }}>
                  Nothing grouped yet. Clusters let one command reach every rover in a block.
                </Text>
              ) : (
                <View style={{ gap: rem(spacing.md) }}>
                  {byCluster.map((c) => (
                    <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md) }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ ...type.caption, color: theme.text, fontWeight: '600' }} numberOfLines={1}>
                          {c.name}
                        </Text>
                        {!!c.description && (
                          <Text style={{ fontSize: rem(11), color: theme.textMuted }} numberOfLines={1}>
                            {c.description}
                          </Text>
                        )}
                      </View>
                      <Text style={{ ...type.caption, color: theme.textDim }}>{plural(c.count, 'rover')}</Text>
                    </View>
                  ))}

                  {unassigned > 0 && (
                    <View
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md),
                        paddingTop: rem(spacing.md), borderTopWidth: 1, borderTopColor: theme.border,
                      }}
                    >
                      <Text style={{ ...type.caption, color: theme.textDim, flex: 1 }}>Ungrouped</Text>
                      <Text style={{ ...type.caption, color: theme.accentTint, fontWeight: '700' }}>
                        {plural(unassigned, 'rover')}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </Collapsible>

            <Collapsible
              title="Recent activity"
              summary={activity.length > 0 ? `Last change ${relativeTime(activity[0].at)}` : 'Nothing yet'}
              icon="history"
              iconColor={theme.accentTint}
            >
              <View style={{ gap: rem(spacing.lg) }}>
                {activity.map((a) => (
                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: rem(spacing.md) }}>
                    <View
                      style={{
                        width: rem(26), height: rem(26), borderRadius: rem(13),
                        backgroundColor: a.kind === 'rover' ? theme.primaryDim : theme.successDim,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <MaterialCommunityIcons
                        name={a.kind === 'rover' ? 'robot-outline' : 'sitemap-outline'}
                        size={rem(14)}
                        color={a.kind === 'rover' ? theme.primaryTint : theme.successTint}
                      />
                    </View>
                    <Text style={{ ...type.caption, color: theme.text, flex: 1 }} numberOfLines={1}>
                      {a.kind === 'rover' ? 'Paired' : 'Created'}{' '}
                      <Text style={{ fontWeight: '700' }}>{a.label}</Text>
                    </Text>
                    <Text style={{ fontSize: rem(11), color: theme.textMuted }}>{relativeTime(a.at)}</Text>
                  </View>
                ))}
              </View>
            </Collapsible>
          </FadeIn>
        )}

        {/* ── Analytics ────────────────────────────────────── */}
        <FadeIn index={5} style={{ marginTop: rem(spacing.xxl) }}>
          <SectionHeader
            title="Analytics"
            accent={theme.accent}
            style={{ paddingHorizontal: PAD, marginBottom: rem(spacing.md) }}
            right={
              <View style={{ flexDirection: 'row', gap: rem(5) }}>
                {analytics.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === analyticsPage ? rem(16) : rem(6),
                      height: rem(6),
                      borderRadius: rem(3),
                      backgroundColor: i === analyticsPage ? theme.primaryTint : theme.border,
                    }}
                  />
                ))}
              </View>
            }
          />

          <ScrollView
            ref={analyticsScroll}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleAnalyticsScroll}
            snapToInterval={cardW}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: PAD }}
          >
            {analytics.map((a) => (
              <View key={a.label} style={{ width: cardW }}>
                <View
                  style={{
                    backgroundColor: theme.surface,
                    borderRadius: radii.xl,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: rem(spacing.xl),
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: rem(spacing.lg),
                  }}
                >
                  <View
                    style={{
                      width: rem(46), height: rem(46), borderRadius: radii.lg,
                      backgroundColor: a.color + '1F', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons name={a.icon} size={rem(22)} color={a.color} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {fetching ? (
                      <Text style={{ fontSize: rem(28), fontWeight: '700', letterSpacing: -1, color: theme.text }}>
                        —
                      </Text>
                    ) : (
                      <AnimatedNumber
                        value={a.figure}
                        format={a.format}
                        style={{ fontSize: rem(28), fontWeight: '700', letterSpacing: -1, color: theme.text }}
                      />
                    )}
                    <Text style={{ ...type.caption, color: theme.textSecondary, marginTop: 2 }}>{a.label}</Text>
                    <Text style={{ fontSize: rem(11), color: theme.textMuted, marginTop: 2 }} numberOfLines={1}>
                      {a.sub}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </FadeIn>
      </Animated.ScrollView>
    </View>
  );
}
