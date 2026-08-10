import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Maximize2 } from 'lucide-react';
import { IconButton } from './ui/Button';
import { cn } from '../lib/cn';

/**
 * The footage panel.
 *
 * Three things this has to get right, none of them cosmetic:
 *
 *   1. It must not cost anything until it is looked at. `preload="metadata"`
 *      fetches the header, not the 3.1MB body, and playback only starts once
 *      the panel is actually on screen — a landing page that streams video to
 *      somebody who never scrolled to it is spending their data for nothing.
 *   2. It must not shift the layout. The frame reserves 16:9 from first paint,
 *      so the page does not jump when the first frame decodes.
 *   3. Autoplay is muted, because every browser blocks audible autoplay — and
 *      this file *has* an audio track, so the unmute control is real rather
 *      than decorative.
 *
 * Under reduced motion nothing plays on its own and the controls are the only
 * way in. Video that starts by itself is exactly what that setting is for.
 */
export default function VideoShowcase({
  src = '/rover-clip.mp4',
  /**
   * The frame at 2s, 256×144 and 7KB.
   *
   * A real file rather than an inline data URI: at this size the base64 would
   * be larger than the request it saves, and a truncated data URI fails as
   * ERR_INVALID_URL with nothing on screen to say why. Regenerate by drawing
   * the clip to a canvas if the footage is ever replaced.
   */
  poster = '/rover-clip-poster.jpg',
  className,
}: {
  src?: string;
  poster?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);

  // Play only while visible. Also pauses on scroll-away, which matters more
  // than the autostart: a looping clip decoding off-screen is pure waste.
  useEffect(() => {
    const frame = frameRef.current;
    const video = ref.current;
    if (!frame || !video || reduced) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Rejects when the tab is backgrounded or the gesture policy blocks
          // it; that is normal, and the controls still work.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(frame);
    return () => observer.disconnect();
  }, [reduced]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const toggleMute = () => {
    const video = ref.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  return (
    <div
      ref={frameRef}
      className={cn(
        'relative overflow-hidden rounded-sheet border border-line bg-sunken elev-3',
        className
      )}
    >
      {/* Space is reserved before the first frame decodes, so nothing below
          this panel moves when it loads. */}
      <div className="relative aspect-video w-full">
        <video
          ref={ref}
          className="h-full w-full object-cover"
          src={src}
          poster={poster}
          // Metadata only — the body is fetched when playback starts.
          preload="metadata"
          muted
          loop
          playsInline
          controls={!!reduced}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
          aria-label="Concept animation of an automated crop field: a domed greenhouse, planted rows, and an aerial drone passing overhead"
        />

        {/*
          A missing clip falls back to its own poster frame rather than an
          error box.

          The video is decoration on a landing page, and a deployment that
          omits it — the 3MB file is easy to leave out of a static host — should
          look like a still photograph, not like something broken. The poster is
          a real frame from the clip, so the panel still shows what it is meant
          to show.
        */}
        {failed && (
          <img
            src={poster}
            alt="Concept animation still: a domed greenhouse over planted crop rows"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* A hairline scrim under the chrome only — a full overlay would wash
            out the footage this panel exists to show. */}
        {!reduced && !failed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black/70 to-transparent"
          />
        )}

        {!reduced && !failed && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
            <IconButton
              icon={playing ? <Pause size={16} /> : <Play size={16} />}
              label={playing ? 'Pause' : 'Play'}
              onClick={toggle}
              className="h-10 w-10 rounded-xl border-white/15 bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
            />
            <IconButton
              icon={muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              label={muted ? 'Unmute' : 'Mute'}
              onClick={toggleMute}
              className="h-10 w-10 rounded-xl border-white/15 bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
            />
            <div className="ml-auto">
              <IconButton
                icon={<Maximize2 size={16} />}
                label="Fullscreen"
                onClick={() => ref.current?.requestFullscreen?.().catch(() => {})}
                className="h-10 w-10 rounded-xl border-white/15 bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
