import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate, Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Rect, Line, Defs, LinearGradient as SvgGradient, Stop, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../motion';

/**
 * App mark: three furrows under a rover tracking across the field.
 * The travelling dot is the intro screen's perpetual micro-interaction —
 * the one place a loop is justified, since it's the brand mark itself.
 */
export function RoverMark({ size = 92, animate = true }: { size?: number; animate?: boolean }) {
  const travel = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!animate || reduced) {
      travel.value = 0.5;
      return;
    }
    // `reverse: true` ping-pongs a single timing. Nesting withDelay inside a
    // withSequence inside withRepeat looks equivalent but stalls after the
    // first leg — the loop never restarts.
    travel.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [animate, reduced]);

  const inset = size * 0.18;

  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(travel.value, [0, 1], [inset, size - inset - size * 0.1]) },
      { translateY: interpolate(travel.value, [0, 0.5, 1], [0, size * 0.045, 0]) },
    ],
  }));

  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, overflow: 'hidden' }}>
      <LinearGradient
        colors={['#C95D34', '#9C4426']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ width: size, height: size }}
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {[
            { y: 38, o: 0.22 },
            { y: 55, o: 0.42 },
            { y: 72, o: 0.22 },
          ].map((row) => (
            <Path
              key={row.y}
              d={`M14 ${row.y} Q50 ${row.y + 9} 86 ${row.y}`}
              stroke="#FFF7ED"
              strokeOpacity={row.o}
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </Svg>

        <Animated.View
          style={[
            {
              position: 'absolute',
              top: size * 0.5,
              left: 0,
              width: size * 0.1,
              height: size * 0.1,
              borderRadius: size * 0.05,
              backgroundColor: '#D4A53A',
            },
            dotStyle,
          ]}
        />
      </LinearGradient>
    </View>
  );
}

/** Empty-state art for the fleet: unplanted rows waiting on a rover. */
export function FurrowArt({ size = 168 }: { size?: number }) {
  const { theme } = useTheme();
  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 168 104">
      <Defs>
        <SvgGradient id="furrowFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={theme.textMuted} stopOpacity="0.15" />
          <Stop offset="1" stopColor={theme.textMuted} stopOpacity="0.55" />
        </SvgGradient>
      </Defs>

      {[52, 66, 80, 94].map((y, i) => (
        <Path
          key={y}
          d={`M${18 - i * 4} ${y} Q84 ${y + 7 + i * 2} ${150 + i * 4} ${y}`}
          stroke="url(#furrowFade)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      ))}

      <G>
        <Rect
          x={62} y={14} width={44} height={34} rx={11}
          fill="none" stroke={theme.primaryTint} strokeOpacity={0.55}
          strokeWidth={1.6} strokeDasharray="5 5"
        />
        <Line x1={84} y1={25} x2={84} y2={37} stroke={theme.primaryTint} strokeWidth={2} strokeLinecap="round" />
        <Line x1={78} y1={31} x2={90} y2={31} stroke={theme.primaryTint} strokeWidth={2} strokeLinecap="round" />
      </G>
    </Svg>
  );
}

/** Empty-state art for clusters: unlinked nodes. */
export function ClusterArt({ size = 168 }: { size?: number }) {
  const { theme } = useTheme();
  const node = (cx: number, cy: number, filled: boolean) => (
    <G key={`${cx}-${cy}`}>
      <Circle cx={cx} cy={cy} r={13} fill={filled ? theme.accentDim : 'transparent'} />
      <Circle
        cx={cx} cy={cy} r={13}
        fill="none"
        stroke={filled ? theme.accent : theme.textMuted}
        strokeWidth={1.6}
        strokeDasharray={filled ? undefined : '4 4'}
      />
    </G>
  );

  return (
    <Svg width={size} height={size * 0.62} viewBox="0 0 168 104">
      <Line x1={84} y1={30} x2={44} y2={74} stroke={theme.border} strokeWidth={1.5} />
      <Line x1={84} y1={30} x2={124} y2={74} stroke={theme.border} strokeWidth={1.5} />
      <Line x1={44} y1={74} x2={124} y2={74} stroke={theme.border} strokeWidth={1.5} strokeDasharray="4 5" />
      {node(84, 30, true)}
      {node(44, 74, false)}
      {node(124, 74, false)}
    </Svg>
  );
}

/** Shown while the camera stream is negotiating or unreachable. */
export function SignalArt({ size = 140, tone }: { size?: number; tone?: string }) {
  const { theme } = useTheme();
  const c = tone || theme.textMuted;
  return (
    <Svg width={size} height={size * 0.7} viewBox="0 0 140 98">
      {[22, 34, 46].map((r, i) => (
        <Path
          key={r}
          d={`M${70 - r} ${70} A${r} ${r} 0 0 1 ${70 + r} ${70}`}
          stroke={c}
          strokeOpacity={0.6 - i * 0.15}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      ))}
      <Circle cx={70} cy={70} r={5} fill={c} />
    </Svg>
  );
}
