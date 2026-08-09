import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoOff, Loader2, Maximize2, Camera as CameraIcon } from 'lucide-react';
import * as relay from '../../services/relay';
import { Badge, Micro, PulseDot } from '../ui/Bits';
import { IconButton } from '../ui/Button';

/**
 * Live view from the rover's ESP32-CAM.
 *
 * Frames arrive base64-encoded over the relay, each one a complete JPEG, so
 * nothing has to be reassembled and a dropped frame costs exactly one frame.
 * They are painted into a canvas rather than swapped through `<img src>`: a
 * data-URI churn at 15fps has the browser allocating and decoding a new
 * resource every frame, which shows up as tearing and a climbing heap.
 *
 * The relay only asks the camera to stream while somebody is watching, so
 * mounting this component is what switches the camera on and unmounting is what
 * switches it off. Leaving it running would burn the rover's battery streaming
 * to an empty room.
 */
export default function CameraView({ mac, available }: { mac: string; available: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const frames = useRef(0);
  const pending = useRef<string | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (!available) return;

    setError(null);
    const started = relay.startCamera(mac);
    if (!started) {
      setError('Relay is not connected');
      return;
    }

    // Frames land far faster than they need painting. Holding only the newest
    // and drawing it on the next animation frame means a burst never queues up
    // a backlog of stale pictures.
    const paint = () => {
      raf.current = requestAnimationFrame(paint);
      const data = pending.current;
      if (!data) return;
      pending.current = null;

      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width;
          canvas.height = img.height;
          setDims({ w: img.width, h: img.height });
        }
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        setLive(true);
      };
      img.src = `data:image/jpeg;base64,${data}`;
    };
    raf.current = requestAnimationFrame(paint);

    const offFrame = relay.onCameraFrame((b64) => {
      pending.current = b64;
      frames.current += 1;
    });
    const offError = relay.onCameraError((message) => {
      setError(message);
      setLive(false);
    });

    // Measured, not claimed. A frame counter that reads the wire is the only
    // honest way to say how good the link actually is.
    const meter = setInterval(() => {
      setFps(frames.current);
      if (frames.current === 0) setLive(false);
      frames.current = 0;
    }, 1000);

    return () => {
      cancelAnimationFrame(raf.current);
      clearInterval(meter);
      offFrame();
      offError();
      relay.stopCamera(mac);
    };
  }, [mac, available]);

  const fullscreen = () => {
    canvasRef.current?.parentElement?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-sunken">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <CameraIcon size={15} className="text-ink-dim" />
          <Micro className="text-ink-dim">Live view</Micro>
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <Badge tone="bad">
              <PulseDot tone="bad" size={5} />
              REC {fps} fps
            </Badge>
          )}
          {dims && <span className="tnum hidden text-[11px] text-ink-muted sm:inline">{dims.w}×{dims.h}</span>}
          <IconButton
            icon={<Maximize2 size={16} />}
            label="Fullscreen"
            onClick={fullscreen}
            disabled={!live}
            className="h-9 w-9 rounded-xl"
          />
        </div>
      </div>

      <div className="relative aspect-4/3 w-full bg-black">
        <canvas ref={canvasRef} className="h-full w-full object-contain" />

        <AnimatePresence>
          {!live && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-sunken/90 px-6 text-center"
            >
              {!available ? (
                <>
                  <VideoOff size={28} className="text-ink-muted" />
                  <p className="text-sm text-ink-dim">No camera board on this rover</p>
                  <p className="max-w-xs text-xs text-ink-muted">
                    Flash <span className="tnum">esp32_cam_relay</span> to an ESP32-CAM and give it
                    this rover's MAC as its <span className="tnum">roverMac</span>.
                  </p>
                </>
              ) : error ? (
                <>
                  <VideoOff size={28} className="text-bad-tint" />
                  <p className="text-sm text-bad-tint">{error}</p>
                </>
              ) : (
                <>
                  {/* A spinner, deliberately — this is an indeterminate wait on
                      hardware, not content loading. */}
                  <Loader2 size={26} className="animate-spin text-primary-tint" />
                  <p className="text-sm text-ink-dim">Waking the camera…</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
