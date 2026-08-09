import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Fleet from './pages/Fleet';
import Control from './pages/Control';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import GamepadDiagnostics from './pages/GamepadDiagnostics';
import { useAuth } from './context/AuthContext';
import { RoverMark } from './components/AppShell';

/** Shown while the stored session is read — a blink, usually. */
function Booting() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.15 }}
      className="flex min-h-dvh flex-col items-center justify-center gap-4"
    >
      <RoverMark size={34} />
      <Loader2 size={20} className="animate-spin text-primary-tint" />
    </motion.div>
  );
}

/**
 * Everything behind here needs an account.
 *
 * The `loading` check is what makes this safe: without it the guard would see
 * `user === null` during the moment before the stored session is read and bounce
 * a signed-in user to the login page on every refresh.
 *
 * Where they were headed is carried in state, so signing in lands on the rover
 * they clicked rather than dumping them on the fleet list.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <Booting />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** Signed-in users have no business on the sign-in page. */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  if (loading) return <Booting />;
  if (user) return <Navigate to="/fleet" replace />;
  return <>{children}</>;
}

export default function App() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Landing />} />

        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        {/* Not guarded either way: this route's whole job is to be the place a
            provider redirect lands while the session is still being exchanged. */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route
          path="/fleet"
          element={
            <RequireAuth>
              <Fleet />
            </RequireAuth>
          }
        />
        <Route
          path="/rover/:id"
          element={
            <RequireAuth>
              <Control />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />

        {/* Unguarded on purpose: diagnosing "the pad does nothing" should not
            require an account, and this route touches neither relay nor rover. */}
        <Route path="/diagnostics/gamepad" element={<GamepadDiagnostics />} />

        {/* Old entry point, kept so existing links and bookmarks still work. */}
        <Route path="/connect" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
