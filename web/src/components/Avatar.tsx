import { useState } from 'react';
import { cn } from '../lib/cn';

/** Initials, at most two, from whatever name we have. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The account picture.
 *
 * Falls back to initials when there is no image *and* when the image fails to
 * load — a Google avatar URL can 403 once the provider rotates it, and a broken
 * image icon in the header looks like a bug in the app rather than a stale URL.
 *
 * `referrerPolicy="no-referrer"` because Google's CDN rejects requests carrying
 * a referrer it does not expect, which is the usual reason these render blank.
 */
export default function Avatar({
  src,
  name,
  size = 32,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = src && !broken;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-line bg-primary-dim',
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-bold text-primary-tint"
          style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
