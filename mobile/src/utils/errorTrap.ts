/**
 * Surfaces the *stack* for startup failures.
 *
 * React Native's default handler prints only `[TypeError: Invalid URL: ]` with
 * no origin, which is close to undebuggable — the message alone cannot tell you
 * which library built the bad URL. This wraps the global handler and the
 * promise rejection tracker so the frames come through, then delegates to the
 * original handler so red-box behaviour is unchanged.
 *
 * Import for side effects as the first line of App.tsx.
 */

declare const global: any;

if (__DEV__) {
  const previous = global.ErrorUtils?.getGlobalHandler?.();

  global.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    console.log(
      `\n[trap] ${isFatal ? 'FATAL ' : ''}${error?.name ?? 'Error'}: ${error?.message ?? error}\n` +
        `${error?.stack ?? '(no stack)'}\n`
    );
    previous?.(error, isFatal);
  });

  // Floating promises never reach the global handler, so they need their own
  // hook. This is the tracker React Native ships with its Promise polyfill.
  try {
    const tracking = require('promise/setimmediate/rejection-tracking');
    tracking.enable({
      allRejections: true,
      onUnhandled: (id: number, error: any) => {
        console.log(
          `\n[trap] Unhandled rejection #${id}: ${error?.message ?? error}\n` +
            `${error?.stack ?? '(no stack)'}\n`
        );
      },
      onHandled: () => {},
    });
  } catch {
    // Older/newer RN may not expose the tracker; the global handler still works.
  }
}

export {};
