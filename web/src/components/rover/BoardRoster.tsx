import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Camera, Radio, Gamepad2, CircleSlash, type LucideIcon } from 'lucide-react';
import type { BoardInfo, BoardRole } from '../../services/relay';
import { DecryptedText } from '../reactbits/Text';
import { Micro, PulseDot } from '../ui/Bits';

/**
 * What this rover is actually made of, right now.
 *
 * A rover is not one ESP32 — drive, camera, sensor hub and any paired
 * controller each hold their own connection to the relay and can reboot without
 * the others noticing. Showing the roster is what lets the console say "camera
 * and sensor hub online" instead of inferring it from whether data happens to
 * be flowing.
 */

// `LucideIcon`, not `React.ElementType`: R3F augments JSX.IntrinsicElements with
// every three.js object, and an unparameterised ElementType then intersects all
// of their prop types down to `never`.
const ROLE: Record<BoardRole, { label: string; icon: LucideIcon; blurb: string }> = {
  rover: { label: 'Drive', icon: Cpu, blurb: 'Motors and headlight' },
  camera: { label: 'Camera', icon: Camera, blurb: 'ESP32-CAM relay' },
  sensor: { label: 'Sensor hub', icon: Radio, blurb: 'Environment readings' },
  controller: { label: 'Controller', icon: Gamepad2, blurb: 'Paired tilt handset' },
};

export default function BoardRoster({ boards }: { boards: BoardInfo[] }) {
  if (boards.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-dashed border-line px-4 py-5">
        <CircleSlash size={18} className="shrink-0 text-ink-muted" />
        <div>
          <p className="text-sm text-ink-2">No boards on the relay</p>
          <p className="text-xs text-ink-muted">
            Commands will be accepted and dropped until one registers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {boards.map((board, i) => {
          const meta = ROLE[board.role];
          const Icon = meta.icon;
          return (
            <motion.div
              key={board.mac}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8, transition: { duration: 0.16 } }}
              transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ok-dim text-ok-tint">
                <Icon size={16} strokeWidth={2} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{meta.label}</span>
                  <PulseDot tone="ok" size={5} halo={false} />
                  <Micro className="text-ok-tint">Online</Micro>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
                  <DecryptedText text={board.mac} className="tnum" />
                  <span aria-hidden>·</span>
                  <DecryptedText text={board.ip} className="tnum" />
                </div>
              </div>

              <span className="hidden shrink-0 text-[11px] text-ink-muted sm:block">{meta.blurb}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
