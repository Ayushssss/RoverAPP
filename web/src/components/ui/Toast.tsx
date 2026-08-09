import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, XCircle, type LucideIcon } from 'lucide-react';

/**
 * Toasts — bottom, glass, auto-dismiss at 4s, at most two on screen.
 *
 * Glass earns its place here: a toast genuinely floats over scrolling content.
 * Two at a time because a stack taller than that stops being a notice and
 * starts being a log.
 *
 * Reserved for outcomes you can keep working through; anything destructive
 * gets a confirm, not a toast.
 */

type Tone = 'success' | 'error' | 'warn' | 'info';

interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

const ICONS: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  warn: AlertTriangle,
  info: Info,
};

const TONE_CLASS: Record<Tone, string> = {
  success: 'text-ok-tint',
  error: 'text-bad-tint',
  warn: 'text-accent-tint',
  info: 'text-primary-tint',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((tone: Tone, message: string) => {
    const id = seq.current++;
    setToasts((prev) => [...prev, { id, tone, message }].slice(-2));
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      warn: (m) => push('warn', m),
      info: (m) => push('info', m),
    }),
    [push]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        // Polite, not assertive: these announce results, they don't interrupt.
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-100 flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICONS[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                // Exits run at 65% of the enter duration.
                exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.16 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="glass rim pointer-events-auto relative flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 elev-2"
              >
                <Icon size={17} className={TONE_CLASS[t.tone]} strokeWidth={2.2} />
                <span className="text-sm text-ink">{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
