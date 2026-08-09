import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Gamepad2,
  Video,
  Thermometer,
  Cpu,
  KeyRound,
  Wifi,
} from 'lucide-react';
import Aurora from '../components/reactbits/Aurora';
import DotGrid from '../components/reactbits/DotGrid';
import SpotlightCard from '../components/reactbits/SpotlightCard';
import { AnimatedContent, Magnet } from '../components/reactbits/Motion';
import { SplitText, ShinyText, DecryptedText } from '../components/reactbits/Text';
import { Badge, Micro, PulseDot } from '../components/ui/Bits';
import Button from '../components/ui/Button';
import { RoverMark } from '../components/AppShell';
import Rover3D from '../components/three/Rover3D';
import VideoShowcase from '../components/VideoShowcase';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  {
    icon: Gamepad2,
    title: 'Drive from the keyboard',
    body:
      'An analogue stick with a 6% dead zone, a hold-to-drive pad, and WASD bound to the same vectors. Whichever you reach for, the rover sees one continuous instruction.',
  },
  {
    icon: Video,
    title: 'Watch what it sees',
    body:
      'JPEG frames relayed from the ESP32-CAM and painted straight to a canvas. The camera only streams while somebody is actually looking at it.',
  },
  {
    icon: Thermometer,
    title: 'Read the ground',
    body:
      'Temperature, humidity, soil and light arrive as an open key→number map. Add a sensor to the hub and it shows up here without a release.',
  },
  {
    icon: Cpu,
    title: 'Every board, accounted for',
    body:
      'A rover is not one ESP32. Drive, camera and sensor hub each hold their own connection, and the roster says which are actually on the relay.',
  },
];

/**
 * The front door.
 *
 * Not a centred hero over three equal cards — the layout is deliberately
 * asymmetric, with the console preview carrying the right-hand weight, because
 * the thing being sold here is an instrument, not a landing page.
 */
export default function Landing() {
  // The call to action follows the session: an operator who is already signed
  // in wants the console, not another sign-in form.
  const { user } = useAuth();
  const cta = user ? '/fleet' : '/login';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="relative min-h-dvh overflow-hidden"
    >
      <Aurora />
      <DotGrid />

      {/* ── nav ── */}
      <header className="relative z-10 mx-auto flex h-20 max-w-6xl items-center gap-3 px-6">
        <RoverMark size={30} />
        <span className="text-[15px] font-bold tracking-tight">
          AgriVerse<span className="text-primary-tint">·</span>Rover
        </span>
        <div className="ml-auto">
          <Link to={cta}>
            <Button size="sm" variant="secondary">
              {user ? 'Open console' : 'Sign in'}
              <ArrowRight size={15} />
            </Button>
          </Link>
        </div>
      </header>

      {/* ── hero ── */}
      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <AnimatedContent>
            <Badge tone="accent" className="mb-6">
              <PulseDot tone="accent" size={5} />
              ESP32 · Socket relay · Live
            </Badge>
          </AnimatedContent>

          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            <SplitText text="Drive the field" />
            <br />
            <span className="text-primary-tint">
              <SplitText text="from a browser tab." delay={0.16} />
            </span>
          </h1>

          <AnimatedContent delay={0.5}>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-ink-dim">
              The same relay your phone talks to, opened up to a full console. Steer, watch the
              camera, read the soil, and write to the panel on the chassis — from whatever machine
              you happen to be sitting at.
            </p>
          </AnimatedContent>

          <AnimatedContent delay={0.62}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Magnet>
                <Link to={cta}>
                  <Button size="lg">
                    {user ? 'Open the console' : 'Create an account'}
                    <ArrowRight size={17} />
                  </Button>
                </Link>
              </Magnet>
              <a href="#how">
                <Button size="lg" variant="ghost">
                  How the link works
                </Button>
              </a>
            </div>
          </AnimatedContent>

          <AnimatedContent delay={0.72}>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <Wifi size={13} /> 25 Hz drive stream
              </span>
              <span className="flex items-center gap-1.5">
                <KeyRound size={13} /> 1 s motor failsafe
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu size={13} /> Four board roles
              </span>
            </div>
          </AnimatedContent>
        </div>

        {/* The machine itself, then the instrument face reading it. Putting the
            rover above the console is the honest order — the hardware is the
            subject and the UI is how you reach it. */}
        <AnimatedContent delay={0.3} direction="right" distance={40}>
          <div className="relative">
            <Rover3D mode="showcase" height={300} className="mb-[-2.5rem]" />

            <div className="glass rim relative overflow-hidden rounded-sheet p-6 elev-3">
              <div className="flex items-center justify-between">
                <Micro>Rover · North Plot</Micro>
                <span className="flex items-center gap-1.5">
                  <PulseDot tone="ok" size={6} />
                  <ShinyText className="micro">Linked</ShinyText>
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-line bg-surface/70 px-4 py-3">
                {[
                  ['X', '0.62'],
                  ['Y', '0.41'],
                  ['Link', 'UP'],
                ].map(([label, value]) => (
                  <div key={label} className="text-center">
                    <Micro>{label}</Micro>
                    <p className="tnum mt-1 text-[15px] text-ink">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ['Temp', '24.6°C'],
                  ['Soil', '38%'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-line bg-surface/70 px-3 py-2.5">
                    <Micro>{label}</Micro>
                    <p className="tnum mt-0.5 text-sm text-ink">{value}</p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-center text-[11px] text-ink-muted">
                <DecryptedText text="A4:CF:12:9B:04:E1" className="tnum" />
              </p>
            </div>
          </div>
        </AnimatedContent>
      </section>

      {/* ── footage ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
        <AnimatedContent>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Micro className="text-primary-tint">Concept</Micro>
              <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
                What the fleet is being built toward.
              </h2>
            </div>
            {/* Labelled as a concept piece, because it is one. Presenting a
                rendered farm as footage of the hardware would be the kind of
                claim that gets found out the first time somebody visits the
                actual field. */}
            <p className="max-w-sm text-sm leading-relaxed text-ink-dim">
              A rendered look at the automated field this console is aimed at — not the current
              hardware, which is an ESP32 on a chassis. Plays muted on scroll, stops when it leaves.
            </p>
          </div>
        </AnimatedContent>

        <AnimatedContent delay={0.08}>
          <VideoShowcase />
        </AnimatedContent>
      </section>

      {/* ── features ── */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 pb-28">
        <AnimatedContent>
          <Micro className="text-primary-tint">What the console does</Micro>
          <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
            Four boards, one instrument.
          </h2>
        </AnimatedContent>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <AnimatedContent key={f.title} delay={i * 0.08}>
              <SpotlightCard className="h-full p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-dim text-primary-tint">
                  <f.icon size={19} strokeWidth={2} />
                </div>
                <h3 className="mt-5 text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-dim">{f.body}</p>
              </SpotlightCard>
            </AnimatedContent>
          ))}
        </div>

        <AnimatedContent delay={0.1}>
          <div className="mt-16 flex flex-col items-start gap-5 rounded-sheet border border-line bg-surface/60 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-bold text-ink">Ready to drive?</h3>
              <p className="mt-1.5 text-sm text-ink-dim">
                Sign in with Google or an email address. Your account owns the fleet and its
                recorded telemetry.
              </p>
            </div>
            <Link to={cta} className="shrink-0">
              <Button size="lg">
                {user ? 'Open the console' : 'Sign in'}
                <ArrowRight size={17} />
              </Button>
            </Link>
          </div>
        </AnimatedContent>
      </section>

      <footer className="relative z-10 border-t border-line px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-ink-muted sm:flex-row">
          <span>AgriVerse Rover · field control console</span>
          <span className="tnum">ESP32 · socket.io relay · React</span>
        </div>
      </footer>
    </motion.div>
  );
}
