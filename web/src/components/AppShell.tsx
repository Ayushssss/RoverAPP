import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Settings as SettingsIcon, LogOut, User as UserIcon, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/cn';
import Avatar from './Avatar';

/** The mark. Procedural rather than an asset, so it re-tints with the scheme. */
export function RoverMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="6" y="11" width="20" height="11" rx="3" fill="var(--c-primary)" />
      <rect x="10" y="7" width="9" height="5" rx="1.6" fill="var(--c-accent)" />
      <circle cx="10.5" cy="23.5" r="4" fill="var(--c-surface)" stroke="var(--c-primary-tint)" strokeWidth="1.6" />
      <circle cx="21.5" cy="23.5" r="4" fill="var(--c-surface)" stroke="var(--c-primary-tint)" strokeWidth="1.6" />
      <path d="M23 11V6" stroke="var(--c-accent)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="23" cy="5" r="1.6" fill="var(--c-accent)" />
    </svg>
  );
}

/**
 * The account button.
 *
 * A menu rather than a link straight to the profile, because sign-out belongs
 * behind one deliberate extra click — putting it in the header as a bare icon
 * is how people sign themselves out mid-drive.
 */
function ProfileMenu() {
  const { displayName, avatarUrl, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on outside click and on Escape. A menu that only closes by
  // reselecting the trigger is a menu that gets left open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-2 transition-colors duration-200',
          open ? 'border-primary/40 bg-primary-dim' : 'border-line bg-raised hover:border-line-strong'
        )}
      >
        <Avatar src={avatarUrl} name={displayName} size={30} />
        <span className="hidden max-w-[12ch] truncate text-sm font-semibold text-ink sm:block">
          {displayName}
        </span>
        <ChevronDown
          size={14}
          className={cn('text-ink-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.13 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="glass rim absolute right-0 top-full z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-2xl elev-3"
          >
            <div className="flex items-center gap-3 border-b border-line px-3.5 py-3">
              <Avatar src={avatarUrl} name={displayName} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
                <p className="truncate text-xs text-ink-muted">{user?.email}</p>
              </div>
            </div>

            <div className="p-1.5">
              {[
                { label: 'Profile', icon: UserIcon, to: '/profile' },
                { label: 'Settings', icon: SettingsIcon, to: '/settings' },
              ].map((item) => (
                <button
                  key={item.to}
                  role="menuitem"
                  onClick={() => go(item.to)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-raised hover:text-ink"
                >
                  <item.icon size={15} />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="border-t border-line p-1.5">
              <button
                role="menuitem"
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                  navigate('/', { replace: true });
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-bad-tint transition-colors hover:bg-bad-dim"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The frame every signed-in page sits in.
 *
 * Glass earns its place on this header: it sits over scrolling content, which
 * is the only condition under which a frosted surface reads as glass rather
 * than as a tinted rectangle.
 */
export default function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors duration-200',
      isActive ? 'bg-primary-dim text-primary-tint' : 'text-ink-dim hover:bg-raised hover:text-ink'
    );

  return (
    <div className="min-h-dvh">
      <header className="glass rim sticky top-0 z-50 border-b border-line">
        <div
          className={cn(
            'mx-auto flex h-16 items-center gap-3 px-4 sm:px-6',
            wide ? 'max-w-[1600px]' : 'max-w-6xl'
          )}
        >
          <NavLink to="/fleet" className="flex items-center gap-2.5" aria-label="AgriVerse Rover home">
            <motion.span
              whileHover={{ rotate: -6, scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            >
              <RoverMark />
            </motion.span>
            <span className="hidden text-[15px] font-bold tracking-tight text-ink sm:block">
              AgriVerse<span className="text-primary-tint">·</span>Rover
            </span>
          </NavLink>

          <nav className="ml-2 flex items-center gap-1">
            <NavLink to="/fleet" className={link}>
              <span className="flex items-center gap-1.5">
                <Radio size={15} />
                Fleet
              </span>
            </NavLink>
            <NavLink to="/settings" className={link}>
              <span className="hidden items-center gap-1.5 sm:flex">
                <SettingsIcon size={15} />
                Settings
              </span>
            </NavLink>
          </nav>

          <div className="ml-auto">
            <ProfileMenu />
          </div>
        </div>
      </header>

      <main className={cn('mx-auto px-4 py-8 sm:px-6', wide ? 'max-w-[1600px]' : 'max-w-6xl')}>
        {children}
      </main>
    </div>
  );
}
