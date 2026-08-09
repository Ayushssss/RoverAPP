import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Square } from 'lucide-react';
import { cn } from '../../lib/cn';

export type Direction = 'forward' | 'backward' | 'left' | 'right';

/**
 * Hold-to-drive pad.
 *
 * Drive starts on pointer *down*, not on click: waiting for the release would
 * put the whole duration of the press between the intent and the movement, and
 * this control is judged entirely on that gap.
 *
 * A held direction stays filled rather than flashing, because "it is driving
 * right now" has to be readable at a glance — a highlight that fades leaves no
 * way to tell a moving rover from a stopped one.
 */

function PadButton({
  icon,
  label,
  active,
  onStart,
  onEnd,
  className,
  keyHint,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onStart: () => void;
  onEnd: () => void;
  className?: string;
  keyHint?: string;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={keyHint ? `${label} · ${keyHint}` : label}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
      }}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onPointerLeave={(e) => {
        // Only relevant if capture was lost; a captured pointer never leaves.
        if (e.buttons > 0) onEnd();
      }}
      className={cn(
        'no-select relative flex h-16 w-16 cursor-pointer touch-none items-center justify-center border transition-colors duration-150',
        active
          ? 'border-transparent bg-primary text-primary-on'
          : 'border-line bg-surface text-ink-2 hover:border-primary/50 hover:bg-primary-dim hover:text-primary-tint',
        className
      )}
    >
      {icon}
      {keyHint && (
        <span
          className={cn(
            'absolute bottom-1 right-1.5 font-mono text-[9px] leading-none transition-colors',
            active ? 'text-primary-on/70' : 'text-ink-muted'
          )}
        >
          {keyHint}
        </span>
      )}
    </motion.button>
  );
}

export default function DPad({
  held,
  onStart,
  onEnd,
  onStop,
}: {
  held: Direction | null;
  onStart: (dir: Direction) => void;
  onEnd: () => void;
  onStop: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className={cn('micro transition-colors', held ? 'text-primary-tint' : 'text-ink-muted')}>
        {held ? 'Driving' : 'Hold to drive'}
      </span>

      <div className="flex flex-col items-center gap-1">
        <PadButton
          icon={<ChevronUp size={24} strokeWidth={2.4} />}
          label="Forward"
          keyHint="W"
          active={held === 'forward'}
          onStart={() => onStart('forward')}
          onEnd={onEnd}
          className="rounded-t-2xl rounded-b-md"
        />
        <div className="flex gap-1">
          <PadButton
            icon={<ChevronLeft size={24} strokeWidth={2.4} />}
            label="Left"
            keyHint="A"
            active={held === 'left'}
            onStart={() => onStart('left')}
            onEnd={onEnd}
            className="rounded-l-2xl rounded-r-md"
          />
          {/* Stop is a click, not a hold — it is an event, not a state. */}
          <motion.button
            type="button"
            aria-label="Emergency stop"
            title="Emergency stop · Space"
            whileTap={{ scale: 0.95 }}
            onClick={onStop}
            className="no-select flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-bad/35 bg-bad-dim text-bad-tint transition-colors duration-150 hover:bg-bad hover:text-white"
          >
            <Square size={18} strokeWidth={2.6} fill="currentColor" />
          </motion.button>
          <PadButton
            icon={<ChevronRight size={24} strokeWidth={2.4} />}
            label="Right"
            keyHint="D"
            active={held === 'right'}
            onStart={() => onStart('right')}
            onEnd={onEnd}
            className="rounded-r-2xl rounded-l-md"
          />
        </div>
        <PadButton
          icon={<ChevronDown size={24} strokeWidth={2.4} />}
          label="Backward"
          keyHint="S"
          active={held === 'backward'}
          onStart={() => onStart('backward')}
          onEnd={onEnd}
          className="rounded-b-2xl rounded-t-md"
        />
      </div>
    </div>
  );
}
