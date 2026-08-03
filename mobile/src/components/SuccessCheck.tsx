import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import LottieView from 'lottie-react-native';
import Animated, { FadeIn as RFadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../motion';
import { haptics } from '../haptics';
import { rem, spacing, type } from '../theme';

/**
 * Hand-authored Lottie: a circle that draws itself, then a check striking
 * through. Two shape layers with animated trim paths — no asset file, no
 * download, ~1KB of JSON. Colour is the success green from the palette;
 * Lottie colours are baked into the document, so it stays constant across
 * schemes (success reads green in all five).
 */
const CHECK_ANIMATION = {
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 44,
  w: 200,
  h: 200,
  nm: 'success-check',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0, ind: 1, ty: 4, nm: 'check', sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
        p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [100, 100, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: 'gr',
          it: [
            {
              ty: 'sh',
              ks: {
                a: 0,
                k: {
                  c: false,
                  v: [[62, 104], [90, 132], [142, 74]],
                  i: [[0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0]],
                },
              },
            },
            {
              ty: 'st',
              c: { a: 0, k: [0.341, 0.725, 0.49, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 14 },
              lc: 2, lj: 2,
            },
            {
              ty: 'tm',
              s: { a: 0, k: 0 },
              e: {
                a: 1,
                k: [
                  { t: 14, s: [0], o: { x: [0.3], y: [0] }, i: { x: [0.2], y: [1] } },
                  { t: 32, s: [100] },
                ],
              },
              o: { a: 0, k: 0 },
              m: 1,
            },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0, op: 44, st: 0,
    },
    {
      ddd: 0, ind: 2, ty: 4, nm: 'ring', sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: -90 },
        p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'el', s: { a: 0, k: [156, 156] }, p: { a: 0, k: [0, 0] } },
            {
              ty: 'st',
              c: { a: 0, k: [0.341, 0.725, 0.49, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 10 },
              lc: 2, lj: 2,
            },
            {
              ty: 'tm',
              s: { a: 0, k: 0 },
              e: {
                a: 1,
                k: [
                  { t: 0, s: [0], o: { x: [0.4], y: [0] }, i: { x: [0.2], y: [1] } },
                  { t: 22, s: [100] },
                ],
              },
              o: { a: 0, k: 0 },
              m: 1,
            },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0, op: 44, st: 0,
    },
  ],
};

export function SuccessCheck({ size = 120, onFinish }: { size?: number; onFinish?: () => void }) {
  return (
    <LottieView
      source={CHECK_ANIMATION as any}
      autoPlay
      loop={false}
      onAnimationFinish={onFinish}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Full-screen confirmation moment: scrim, the drawing check, one line of copy,
 * then `onDone`. Under reduced motion it never mounts — callers already pair
 * it with a toast, so nothing is lost.
 */
export function SuccessOverlay({
  visible, message, onDone,
}: {
  visible: boolean;
  message: string;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (visible) haptics.success();
    if (visible && reduced) onDone();
  }, [visible, reduced]);

  if (!visible || reduced) return null;

  return (
    <Animated.View
      entering={RFadeIn.duration(160)}
      exiting={FadeOut.duration(180)}
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: theme.scrim,
        alignItems: 'center', justifyContent: 'center',
        gap: rem(spacing.lg),
        zIndex: 100,
      }}
    >
      <SuccessCheck size={rem(132)} onFinish={onDone} />
      <Text style={{ ...type.subheading, color: '#FFF7ED' }}>{message}</Text>
    </Animated.View>
  );
}
