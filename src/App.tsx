import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import { BassMicrophoneAnalyzer, type AudioSnapshot } from './audio/microphone'
import { frequencyToNote } from './audio/pitch'
import {
  randomTarget,
  targetMatches,
  type ExerciseTarget,
  type PracticeMode,
} from './exercise'
import Metronome from './Metronome'
import './styles.css'

const initialSnapshot: AudioSnapshot = { state: 'idle', reading: null, signalLevel: 0 }
type Feedback = 'neutral' | 'correct' | 'wrong'

interface ToolsContextValue {
  snapshot: AudioSnapshot
  mode: PracticeMode
  target: ExerciseTarget
  feedback: Feedback
  listening: boolean
  selectMode: (mode: PracticeMode) => void
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

function AppShell() {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [mode, setMode] = useState<PracticeMode>(savedMode)
  const [target, setTarget] = useState<ExerciseTarget>(() => randomTarget(savedMode()))
  const [feedback, setFeedback] = useState<Feedback>('neutral')
  const analyzer = useRef<BassMicrophoneAnalyzer | null>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ignoredHeldMidi = useRef<number | null>(null)
  const listening = snapshot.state === 'listening'
  const playedNote = snapshot.reading ? frequencyToNote(snapshot.reading.frequency) : null
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isPractice = pathname === '/'
  const isMetronome = pathname === '/metronome'

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
        setTarget((current) => randomTarget(mode, current))
        setFeedback('neutral')
      }, 480)
    } else {
      setFeedback('wrong')
    }
  }, [snapshot.reading?.stable, snapshot.reading?.frequency, playedNote?.midi, target, mode, feedback, isPractice])

  useEffect(() => {
    if (!snapshot.reading?.stable) setFeedback((current) => current === 'correct' ? current : 'neutral')
  }, [snapshot.reading?.stable])

  useEffect(() => {
    setFeedback('neutral')
    if (isMetronome && analyzer.current) {
      analyzer.current.stop()
      analyzer.current = null
    }
  }, [pathname, isMetronome])

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
    setTarget(randomTarget(nextMode))
    setFeedback('neutral')
    ignoredHeldMidi.current = playedNote?.midi ?? null
  }

  const statusLabel = {
    idle: 'Microphone off', requesting: 'Waiting for permission', listening: 'Listening',
    denied: 'Permission blocked', unavailable: 'Microphone unavailable', error: 'Audio error',
  }[snapshot.state]

  return (
    <main className={`app feedback-${feedback}`}>
      <header className="app-header">
        <Link className="brand" to="/">Bass Tools</Link>
        <nav className="tool-tabs" aria-label="Tools">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: 'selected' }}>Note Finder</Link>
          <Link to="/tuner" activeProps={{ className: 'selected' }}>Tuner</Link>
          <Link to="/metronome" activeProps={{ className: 'selected' }}>Metronome</Link>
        </nav>
        <span className={`listening-state ${listening ? 'active' : ''} ${isMetronome ? 'placeholder' : ''}`}>
          <i />{statusLabel}
        </span>
      </header>

      <ToolsContext.Provider value={{ snapshot, mode, target, feedback, listening, selectMode, toggleMicrophone }}>
        <div className="route-stage"><Outlet /></div>
      </ToolsContext.Provider>

      {snapshot.error && <p className="error" role="alert">{snapshot.error}</p>}

      {isPractice && <footer className="instrument-footer">
        <span>Standard 5-string · B–E–A–D–G</span>
      </footer>}
    </main>
  )
}

function PracticeRoute() {
  const { mode, target, feedback, listening, selectMode, snapshot, toggleMicrophone } = useTools()

  return <section className="practice" id="practice" aria-live="polite">
    <ModeSwitch mode={mode} onChange={selectMode} />
    <p className="eyebrow">PLAY THIS {mode === 'staff' ? 'PITCH' : 'NOTE'}</p>
    <div className="prompt-frame">
      {mode === 'note' ? <NotePrompt target={target} /> : <BassStaff target={target} />}
    </div>
    <FeedbackMessage feedback={feedback} listening={listening} />
    <MicrophoneControl snapshot={snapshot} onToggle={toggleMicrophone} />
  </section>
}

function TunerRoute() {
  const { snapshot, toggleMicrophone } = useTools()
  return <Tuner snapshot={snapshot} onToggle={toggleMicrophone} />
}

const rootRoute = createRootRoute({ component: AppShell })
const practiceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: PracticeRoute })
const tunerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tuner', component: TunerRoute })
const metronomeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/metronome', component: Metronome })
const routeTree = rootRoute.addChildren([practiceRoute, tunerRoute, metronomeRoute])

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
  return <div className="mode-switch" aria-label="Exercise mode">
    <button type="button" className={mode === 'note' ? 'selected' : ''} onClick={() => onChange('note')}>Note name</button>
    <button type="button" className={mode === 'staff' ? 'selected' : ''} onClick={() => onChange('staff')}>Bass clef</button>
  </div>
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
  return <p className="feedback-message" aria-live="assertive"><i />{message}</p>
}

function MicrophoneControl({ snapshot, onToggle, purpose = 'practice' }: { snapshot: AudioSnapshot; onToggle: () => void; purpose?: 'practice' | 'tuner' }) {
  const listening = snapshot.state === 'listening'
  return <button className="primary-button" type="button" onClick={onToggle} disabled={snapshot.state === 'requesting'}>
    {listening ? `Stop ${purpose}` : snapshot.state === 'requesting' ? 'Waiting…' : `Start ${purpose}`}
  </button>
}

function Tuner({ snapshot, onToggle }: { snapshot: AudioSnapshot; onToggle: () => void }) {
  const note = snapshot.reading ? frequencyToNote(snapshot.reading.frequency) : null
  const stable = snapshot.reading?.stable
  const cents = note ? Math.round(note.cents) : 0
  const meterPosition = Math.max(0, Math.min(100, 50 + cents))

  return <section className={`tool-panel tuner ${stable ? 'is-stable' : ''}`} aria-live="polite">
    <div className="tuner-heading"><span>TUNER</span><small>{stable ? 'Note locked' : 'Play a note'}</small></div>
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
  </section>
}

export default App
