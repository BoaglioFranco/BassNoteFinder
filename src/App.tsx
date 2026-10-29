import { createContext, lazy, Suspense, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import {
  Alert,
  AppShell as MantineAppShell,
  Badge,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { Activity, AudioLines, CircleGauge, Mic, Music2, Square, Timer } from 'lucide-react'
import { BassMicrophoneAnalyzer, type AudioSnapshot } from './audio/microphone'
import { frequencyToNote } from './audio/pitch'
import {
  randomTarget,
  targetMatches,
  type BassStringCount,
  type ExerciseTarget,
  type PracticeMode,
} from './exercise'
import './styles.css'

const Metronome = lazy(() => import('./Metronome'))
const BeatRuler = lazy(() => import('./BeatRuler'))

const initialSnapshot: AudioSnapshot = { state: 'idle', reading: null, signalLevel: 0 }
type Feedback = 'neutral' | 'correct' | 'wrong'

interface ToolsContextValue {
  snapshot: AudioSnapshot
  mode: PracticeMode
  target: ExerciseTarget
  feedback: Feedback
  listening: boolean
  stringCount: BassStringCount
  selectMode: (mode: PracticeMode) => void
  selectStringCount: (stringCount: BassStringCount) => void
  toggleMicrophone: () => Promise<void>
}

const ToolsContext = createContext<ToolsContextValue | null>(null)

function useTools() {
  const context = useContext(ToolsContext)
  if (!context) throw new Error('Tool routes must be rendered inside the app shell')
  return context
}

function savedMode(): PracticeMode {
  return localStorage.getItem('bass-note-finder-mode') === 'staff' ? 'staff' : 'note'
}

function savedStringCount(): BassStringCount {
  return localStorage.getItem('bass-note-finder-strings') === '4' ? 4 : 5
}

function ToolShell() {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [mode, setMode] = useState<PracticeMode>(savedMode)
  const [stringCount, setStringCount] = useState<BassStringCount>(savedStringCount)
  const [target, setTarget] = useState<ExerciseTarget>(() => randomTarget(savedMode(), undefined, savedStringCount()))
  const [feedback, setFeedback] = useState<Feedback>('neutral')
  const analyzer = useRef<BassMicrophoneAnalyzer | null>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ignoredHeldMidi = useRef<number | null>(null)
  const listening = snapshot.state === 'listening'
  const playedNote = snapshot.reading ? frequencyToNote(snapshot.reading.frequency) : null
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isPractice = pathname === '/'
  const isTimingTool = pathname === '/metronome' || pathname === '/beat-ruler'

  useEffect(() => () => {
    analyzer.current?.stop()
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
  }, [])

  useEffect(() => {
    if (!isPractice || !snapshot.reading?.stable || !playedNote || feedback === 'correct') return

    if (ignoredHeldMidi.current !== null) {
      if (playedNote.midi === ignoredHeldMidi.current) return
      ignoredHeldMidi.current = null
    }

    if (targetMatches(target, playedNote.midi, mode)) {
      setFeedback('correct')
      ignoredHeldMidi.current = playedNote.midi
      advanceTimer.current = setTimeout(() => {
        setTarget((current) => randomTarget(mode, current, stringCount))
        setFeedback('neutral')
      }, 480)
    } else {
      setFeedback('wrong')
    }
  }, [snapshot.reading?.stable, snapshot.reading?.frequency, playedNote?.midi, target, mode, stringCount, feedback, isPractice])

  useEffect(() => {
    if (!snapshot.reading?.stable) setFeedback((current) => current === 'correct' ? current : 'neutral')
  }, [snapshot.reading?.stable])

  useEffect(() => {
    setFeedback('neutral')
    if (isTimingTool && analyzer.current) {
      analyzer.current.stop()
      analyzer.current = null
    }
  }, [pathname, isTimingTool])

  const toggleMicrophone = async () => {
    if (listening || snapshot.state === 'requesting') {
      analyzer.current?.stop()
      analyzer.current = null
      setFeedback('neutral')
      ignoredHeldMidi.current = null
      return
    }
    analyzer.current = new BassMicrophoneAnalyzer(setSnapshot)
    await analyzer.current.start()
  }

  const selectMode = (nextMode: PracticeMode) => {
    if (nextMode === mode) return
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    localStorage.setItem('bass-note-finder-mode', nextMode)
    setMode(nextMode)
    setTarget(randomTarget(nextMode, undefined, stringCount))
    setFeedback('neutral')
    ignoredHeldMidi.current = playedNote?.midi ?? null
  }

  const selectStringCount = (nextStringCount: BassStringCount) => {
    if (nextStringCount === stringCount) return
    if (advanceTimer.current) clearTimeout(advanceTimer.current)
    localStorage.setItem('bass-note-finder-strings', String(nextStringCount))
    setStringCount(nextStringCount)
    setTarget(randomTarget(mode, undefined, nextStringCount))
    setFeedback('neutral')
    ignoredHeldMidi.current = playedNote?.midi ?? null
  }

  const statusLabel = {
    idle: 'Microphone off', requesting: 'Waiting for permission', listening: 'Listening',
    denied: 'Permission blocked', unavailable: 'Microphone unavailable', error: 'Audio error',
  }[snapshot.state]

  return <MantineAppShell className={`app feedback-${feedback}`} header={{ height: { base: 116, sm: 72 } }}>
    <MantineAppShell.Header className="app-header" withBorder={false}>
      <Container size="lg" h="100%" px={{ base: 'sm', sm: 'md' }}>
        <Group className="header-row" h={{ base: 62, sm: '100%' }} justify="space-between" wrap="nowrap">
          <UnstyledButton component={Link} to="/" className="brand" aria-label="Bass Tools home">
            <Group gap={9} wrap="nowrap">
              <Music2 size={27} strokeWidth={2.2} aria-hidden />
              <Text component="span" fw={800} fz="xl" c="white">Bass Tools</Text>
            </Group>
          </UnstyledButton>
          {!isTimingTool && <Badge className="listening-state" variant="white" color={listening ? 'green' : 'gray'}
            leftSection={<span className="status-dot" />} size="lg" radius="xl">{statusLabel}</Badge>}
        </Group>
        <nav className="tool-tabs" aria-label="Tools">
          <ToolLink to="/" exact icon={<Activity size={17} />}>Note Finder</ToolLink>
          <ToolLink to="/tuner" icon={<CircleGauge size={17} />}>Tuner</ToolLink>
          <ToolLink to="/metronome" icon={<Timer size={17} />}>Metronome</ToolLink>
          <ToolLink to="/beat-ruler" icon={<AudioLines size={17} />}>Beat Ruler</ToolLink>
        </nav>
      </Container>
    </MantineAppShell.Header>

    <MantineAppShell.Main className="route-stage">
      <ToolsContext.Provider value={{ snapshot, mode, target, feedback, listening, stringCount, selectMode, selectStringCount, toggleMicrophone }}>
        <Outlet />
      </ToolsContext.Provider>
      {snapshot.error && <Container size="sm" mt="md"><Alert color="red" role="alert">{snapshot.error}</Alert></Container>}
    </MantineAppShell.Main>
  </MantineAppShell>
}

function ToolLink({ to, exact, icon, children }: { to: '/' | '/tuner' | '/metronome' | '/beat-ruler'; exact?: boolean; icon: ReactNode; children: ReactNode }) {
  return <Link to={to} activeOptions={exact ? { exact: true } : undefined} activeProps={{ className: 'selected' }}>
    {icon}<span>{children}</span>
  </Link>
}

function PracticeRoute() {
  const { mode, target, feedback, listening, stringCount, selectMode, selectStringCount, snapshot, toggleMicrophone } = useTools()

  return <Container size="sm" className="practice" id="practice" aria-live="polite">
    <Paper className="practice-card" withBorder p={{ base: 'lg', sm: 36 }}>
    <div className="practice-controls">
      <ModeSwitch mode={mode} onChange={selectMode} />
      <InstrumentSwitch stringCount={stringCount} onChange={selectStringCount} />
    </div>
    <Text className="eyebrow">PLAY THIS {mode === 'staff' ? 'PITCH' : 'NOTE'}</Text>
    <div className="prompt-frame">
      {mode === 'note' ? <NotePrompt target={target} /> : <BassStaff target={target} />}
    </div>
    <FeedbackMessage feedback={feedback} listening={listening} />
    <MicrophoneControl snapshot={snapshot} onToggle={toggleMicrophone} />
    </Paper>
  </Container>
}

function TunerRoute() {
  const { snapshot, toggleMicrophone } = useTools()
  return <Tuner snapshot={snapshot} onToggle={toggleMicrophone} />
}

const rootRoute = createRootRoute({ component: ToolShell })
const practiceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: PracticeRoute })
const tunerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tuner', component: TunerRoute })
const metronomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/metronome',
  component: () => <Suspense fallback={<Center h={240}><Loader /></Center>}><Metronome /></Suspense>,
})
const beatRulerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/beat-ruler',
  component: () => <Suspense fallback={<Center h={240}><Loader /></Center>}><BeatRuler /></Suspense>,
})
const routeTree = rootRoute.addChildren([practiceRoute, tunerRoute, metronomeRoute, beatRulerRoute])

export function createAppRouter() {
  return createRouter({ routeTree })
}

type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register { router: AppRouter }
}

function App() {
  const [router] = useState(createAppRouter)
  return <RouterProvider router={router} />
}

function ModeSwitch({ mode, onChange }: { mode: PracticeMode; onChange: (mode: PracticeMode) => void }) {
  return <Button.Group aria-label="Exercise mode">
    <Button variant={mode === 'note' ? 'filled' : 'default'} className={mode === 'note' ? 'selected' : ''} onClick={() => onChange('note')}>Note name</Button>
    <Button variant={mode === 'staff' ? 'filled' : 'default'} className={mode === 'staff' ? 'selected' : ''} onClick={() => onChange('staff')}>Bass clef</Button>
  </Button.Group>
}

function InstrumentSwitch({ stringCount, onChange }: { stringCount: BassStringCount; onChange: (stringCount: BassStringCount) => void }) {
  return <Stack gap={5} className="instrument-switch">
    <Text size="xs" c="dimmed" fw={700}>STANDARD</Text>
    <Button.Group aria-label="Bass configuration">
      <Button size="sm" variant={stringCount === 4 ? 'filled' : 'default'} className={stringCount === 4 ? 'selected' : ''} onClick={() => onChange(4)}>4 string</Button>
      <Button size="sm" variant={stringCount === 5 ? 'filled' : 'default'} className={stringCount === 5 ? 'selected' : ''} onClick={() => onChange(5)}>5 string</Button>
    </Button.Group>
  </Stack>
}

function NotePrompt({ target }: { target: ExerciseTarget }) {
  const accidental = target.name.slice(1)
  return <div className="letter-prompt" aria-label={`Play ${target.name}`}>
    <div className="letter-name"><span>{target.letter}</span>{accidental && <sup>{accidental}</sup>}</div>
    <small>{target.spanishName}</small>
  </div>
}

function BassStaff({ target }: { target: ExerciseTarget }) {
  const container = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const host = container.current
    let cancelled = false

    const draw = async () => {
      const { Accidental, Barline, ModifierContext, Renderer, Stave, StaveNote, TickContext } = await import('vexflow/bravura')
      if (!host || cancelled) return
      host.replaceChildren()

      const renderer = new Renderer(host, Renderer.Backends.SVG)
      // Render onto a compact logical score, then let CSS enlarge it uniformly.
      // This gives a short staff with comfortably sized engraving.
      renderer.resize(300, 180)
      const context = renderer.getContext()
      const stave = new Stave(20, 40, 260)
      stave.setBegBarType(Barline.type.NONE).setEndBarType(Barline.type.NONE)
      stave.addClef('bass').setContext(context).draw()

      const accidental = target.accidental === 'sharp' ? '#' : target.accidental === 'flat' ? 'b' : ''
      const note = new StaveNote({
        clef: 'bass',
        keys: [`${target.letter.toLowerCase()}${accidental}/${target.displayOctave}`],
        duration: 'w',
      })
      if (accidental) note.addModifier(new Accidental(accidental))
      note.setStave(stave).addToModifierContext(new ModifierContext())
      new TickContext().addTickable(note).preFormat().setX(150)
      note.setContext(context).draw()
    }

    void draw()
    return () => {
      cancelled = true
      host?.replaceChildren()
    }
  }, [target])

  return <div ref={container} className="bass-staff" role="img" aria-label="Play the note shown on the bass clef" />
}

function FeedbackMessage({ feedback, listening }: { feedback: Feedback; listening: boolean }) {
  const message = feedback === 'correct' ? 'That’s it' : feedback === 'wrong' ? 'Try another note' : listening ? 'Listening…' : 'Start the microphone when you’re ready'
  return <Group className="feedback-message" gap="xs" justify="center" aria-live="assertive"><span className="status-dot" />{message}</Group>
}

function MicrophoneControl({ snapshot, onToggle, purpose = 'practice' }: { snapshot: AudioSnapshot; onToggle: () => void; purpose?: 'practice' | 'tuner' }) {
  const listening = snapshot.state === 'listening'
  return <Button className="primary-button" size="md" type="button" onClick={onToggle} loading={snapshot.state === 'requesting'}
    leftSection={listening ? <Square size={17} fill="currentColor" /> : <Mic size={18} />}>
    {listening ? `Stop ${purpose}` : snapshot.state === 'requesting' ? 'Waiting…' : `Start ${purpose}`}
  </Button>
}

function Tuner({ snapshot, onToggle }: { snapshot: AudioSnapshot; onToggle: () => void }) {
  const note = snapshot.reading ? frequencyToNote(snapshot.reading.frequency) : null
  const stable = snapshot.reading?.stable
  const cents = note ? Math.round(note.cents) : 0
  const meterPosition = Math.max(0, Math.min(100, 50 + cents))

  return <Container size="sm" className="tool-container"><Paper component="section" className={`tool-panel tuner ${stable ? 'is-stable' : ''}`} withBorder aria-live="polite" aria-label="Tuner">
    <Group className="tool-heading" justify="space-between"><Text fw={800}>TUNER</Text><Badge color={stable ? 'green' : 'gray'} variant="light">{stable ? 'Note locked' : 'Play a note'}</Badge></Group>
    <div className="note-display">
      <span className="note-name">{stable && note ? note.note : '—'}</span>
      <span className="octave">{stable && note ? `octave ${note.octave}` : 'WAITING FOR A STABLE NOTE'}</span>
    </div>
    <div className="cent-meter">
      <span>♭ 50</span><span>IN TUNE</span><span>50 ♯</span>
      <div className="rail"><i className="center-line" /><i className="needle" style={{ left: `${meterPosition}%` }} /></div>
    </div>
    <div className="tuner-readout">
      <span>{snapshot.reading ? snapshot.reading.frequency.toFixed(2) : '—'} <small>Hz</small></span>
      <span>{note ? `${cents > 0 ? '+' : ''}${cents}` : '—'} <small>cents</small></span>
    </div>
    <MicrophoneControl snapshot={snapshot} onToggle={onToggle} purpose="tuner" />
  </Paper></Container>
}

export default App
