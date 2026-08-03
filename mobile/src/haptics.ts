import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Haptics are a garnish, never a signal on their own — every call here has a
 * visual counterpart. Failures are swallowed: plenty of Android devices have
 * no motor, or the user has disabled system haptics, and neither is an error
 * worth surfacing.
 */
function fire(run: () => Promise<void>) {
  if (!supported) return;
  run().catch(() => {});
}

export const haptics = {
  /** Light tick — list rows, chips, secondary controls. */
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Firmer thud — primary CTAs and rover commands. */
  press: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Reserved for genuinely heavy actions: stop, disconnect. */
  heavy: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** Moving between discrete options — toggles, segmented controls. */
  selection: () => fire(() => Haptics.selectionAsync()),

  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
