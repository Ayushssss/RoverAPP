import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import {
  ScrollView, View, Keyboard, Platform, ScrollViewProps, StyleProp, ViewStyle,
} from 'react-native';

interface KeyboardAware {
  /** Scrolls the given wrapper into view above the keyboard. */
  ensureVisible: (ref: React.RefObject<View | null>) => void;
  keyboardHeight: number;
}

const KeyboardAwareContext = createContext<KeyboardAware>({
  ensureVisible: () => {},
  keyboardHeight: 0,
});

/** No-ops outside a provider, so inputs work anywhere without extra wiring. */
export function useKeyboardAware() {
  return useContext(KeyboardAwareContext);
}

interface Props extends Omit<ScrollViewProps, 'ref'> {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Breathing room left above the focused field. */
  extraOffset?: number;
}

/**
 * A ScrollView that keeps the focused input above the keyboard.
 *
 * Deliberately dependency-free. `KeyboardAvoidingView` only shifts the whole
 * container, which is not enough on a long form — the field you're typing in
 * can still end up under the keyboard. This measures the focused wrapper
 * against the scroll content and scrolls it into view.
 */
export default function KeyboardAwareScroll({
  children, contentContainerStyle, extraOffset = 28, ...rest
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const pending = useRef<React.RefObject<View | null> | null>(null);

  useEffect(() => {
    // iOS reports `will*` ahead of the animation, so the scroll lands in sync
    // with the keyboard. Android only fires `did*`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      // A field focused before the keyboard existed has no useful geometry
      // yet; re-run it now that we know how much space is left.
      if (pending.current) scrollTo(pending.current);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      pending.current = null;
    });

    return () => { show.remove(); hide.remove(); };
  }, []);

  const scrollTo = useCallback((targetRef: React.RefObject<View | null>) => {
    const target = targetRef.current;
    const content = contentRef.current;
    if (!target || !content) return;

    // One frame of delay lets layout settle before measuring.
    requestAnimationFrame(() => {
      try {
        target.measureLayout(
          content as any,
          (_x: number, y: number) => {
            scrollRef.current?.scrollTo({ y: Math.max(y - extraOffset, 0), animated: true });
          },
          () => {}
        );
      } catch {
        // measureLayout throws if the node unmounted mid-measure; the field is
        // gone, so there is nothing to scroll to.
      }
    });
  }, [extraOffset]);

  const ensureVisible = useCallback((targetRef: React.RefObject<View | null>) => {
    pending.current = targetRef;
    scrollTo(targetRef);
  }, [scrollTo]);

  return (
    <KeyboardAwareContext.Provider value={{ ensureVisible, keyboardHeight }}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        {...rest}
        contentContainerStyle={contentContainerStyle}
      >
        <View ref={contentRef} collapsable={false}>
          {children}
          {/* A spacer rather than extra paddingBottom, so the caller's own
              bottom inset is preserved instead of being overwritten. */}
          <View style={{ height: keyboardHeight }} />
        </View>
      </ScrollView>
    </KeyboardAwareContext.Provider>
  );
}
