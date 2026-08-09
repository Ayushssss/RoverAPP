import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, MonitorSmartphone } from 'lucide-react';
import * as relay from '../../services/relay';
import Button from '../ui/Button';
import { Field, Input, Micro } from '../ui/Bits';
import { useToast } from '../ui/Toast';

const WIDTH = 16;

/**
 * Push text to the rover's 16x2 LCD.
 *
 * Lines are clamped to 16 characters here as well as on the relay, so what the
 * preview shows is exactly what the panel will show — a field that silently
 * accepts a 30-character line and then truncates it is a field that lies.
 *
 * The result reports whether a board actually *received* it, not whether the
 * message left the browser. Those two are different, and the gap between them
 * is where this kind of thing goes wrong.
 */
export default function DisplayComposer({ mac, disabled }: { mac: string; disabled: boolean }) {
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const send = async () => {
    setSending(true);
    const delivered = await relay.sendDisplay(mac, line1, line2);
    setSending(false);
    if (delivered) toast.success('Written to the panel');
    else toast.error('Nothing received it — no boards connected');
  };

  const pad = (s: string) => s.slice(0, WIDTH).padEnd(WIDTH, ' ');

  return (
    <div className="space-y-4">
      {/* A literal 16x2 character cell panel. Fixed-width cells because a
          proportional preview of a monospace device tells you nothing about
          whether your text fits. */}
      <div className="rounded-2xl border border-line bg-[#0a1a12] p-3">
        <div className="flex items-center gap-2 pb-2">
          <MonitorSmartphone size={13} className="text-ok-tint/60" />
          <Micro className="text-ok-tint/60">16×2 character panel</Micro>
        </div>
        <div className="space-y-1 rounded-lg bg-[#06120c] p-2.5">
          {[pad(line1), pad(line2)].map((line, r) => (
            <div key={r} className="flex gap-[2px]">
              {line.split('').map((ch, c) => (
                <span
                  key={c}
                  className="flex h-6 w-[calc((100%-30px)/16)] min-w-0 items-center justify-center rounded-[2px] bg-ok/8 font-mono text-[13px] leading-none text-ok-tint"
                  style={{ textShadow: '0 0 8px color-mix(in srgb, var(--c-ok-tint) 60%, transparent)' }}
                >
                  {ch === ' ' ? ' ' : ch}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Line 1" hint={`${line1.length}/${WIDTH}`}>
          <Input
            mono
            value={line1}
            maxLength={WIDTH}
            placeholder="AGRIVERSE"
            onChange={(e) => setLine1(e.target.value)}
          />
        </Field>
        <Field label="Line 2" hint={`${line2.length}/${WIDTH}`}>
          <Input
            mono
            value={line2}
            maxLength={WIDTH}
            placeholder="FIELD 7 · READY"
            onChange={(e) => setLine2(e.target.value)}
          />
        </Field>
      </div>

      <Button
        onClick={send}
        disabled={disabled || sending || (!line1 && !line2)}
        className="w-full sm:w-auto"
      >
        <motion.span animate={sending ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.6 }}>
          <Send size={16} />
        </motion.span>
        {sending ? 'Sending…' : 'Write to panel'}
      </Button>
    </div>
  );
}
