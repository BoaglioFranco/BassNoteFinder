# Bass Note Finder

A small collection of bass practice tools for a standard five-string bass in B–E–A–D–G tuning. Note Finder supports two endless practice modes:

- **Note name:** play the requested pitch class in any octave.
- **Bass clef:** play the exact written pitch from B0 through G3 (the instrument's first 12 frets). Notation follows the standard electric-bass convention and is written one octave above sounding pitch.

Stable correct notes briefly turn the screen green and advance automatically. Stable wrong notes produce red feedback. Sharps and flats are mixed throughout the exercises.

The app has three tool tabs:

- **Note Finder:** the pitch-recognition exercise described above.
- **Tuner:** frequency and cents feedback using the same microphone analyzer.
- **Metronome:** a Tone.js-backed musical transport with 30–240 BPM, 2–6 beats per bar, first-beat accent, volume control, and four sound choices. Woodblock is the default; the drum-kit sound uses recorded acoustic kick, snare, and hi-hat samples. Quarter, eighth, and sixteenth-note subdivisions are supported.

Bass-clef notation is engraved in SVG with VexFlow's Bravura music font and loaded only when that exercise mode is opened.

## Run it

```bash
npm install
npm run dev
```

Use `npm test` for the detector and exercise behavior tests, and `npm run build` for the production bundle.

## Code flow

```text
main.tsx
  → mounts App

App
  → restores the last exercise mode from localStorage
  → creates a random ExerciseTarget
  → starts BassMicrophoneAnalyzer when practice begins

BassMicrophoneAnalyzer
  → requests microphone access with getUserMedia()
  → connects the input to a Web Audio AnalyserNode
  → reads audio samples on each animation frame
  → runs pitch detection approximately every 60 ms

detectPitch()
  → rejects weak signals
  → uses correlation to estimate the fundamental frequency
  → returns frequency, clarity, and signal strength

PitchStabilityTracker
  → collects readings over a 450 ms window
  → calculates the median frequency and pitch spread
  → marks the reading stable after at least six consistent samples

Analyzer callback
  → sends an AudioSnapshot to App
  → App converts the frequency into a MIDI note

Matching effect
  → ignores readings that are not stable
  → Note Name mode compares MIDI pitch classes
  → Bass Clef mode compares exact MIDI values

Wrong match
  → displays red feedback and keeps the current target

Correct match
  → displays green feedback
  → waits 480 ms
  → generates the next target automatically
  → ignores the sustained tail of the previous note

Bass Clef renderer
  → converts sounding pitch to written pitch one octave higher
  → dynamically loads VexFlow and its Bravura font
  → renders the staff, clef, whole note, accidental, and ledger lines as SVG

Tuner
  → reuses the same AudioSnapshot
  → displays the detected note, frequency, and cents offset

Metronome UI
  → stores user settings in localStorage
  → creates a library-neutral RhythmPattern on a sixteenth-note grid
  → sends settings and lifecycle commands to MetronomeEngine

MetronomeEngine
  → validates patterns independently of the audio library
  → commits rhythm edits together on the next downbeat
  → delegates timing, tempo, and draw synchronization to Tone.js

ToneRhythmAudio
  → schedules against Tone.Transport's audio clock
  → routes every sound through one master gain
  → reuses decoded acoustic drum samples with round-robin variations
  → aligns React visuals through Tone.getDraw()
```

The main orchestration and UI live in `src/App.tsx`. Target generation and matching live in `src/exercise.ts`. Microphone capture, pitch detection, and stability tracking live under `src/audio/`.

Rhythms are plain data in `src/rhythm/pattern.ts`: every event has an attack step and duration measured on a canonical sixteenth-note grid. `src/audio/metronome.ts` adapts that model to an injected audio port, while `src/audio/toneAdapter.ts` is the only Tone.js-specific layer. This separation is intended to let the beat ruler add rests, attacks, and note-length bars without coupling saved exercises to Tone.js.

Tone.js is pinned to the stable 15.1.22 release. The metronome route is lazy-loaded so its audio framework does not increase the Note Finder's initial JavaScript bundle.

## Audio notes

The acoustic drum files under `public/audio/drums/` come from the CC0 Virtuosity Drums library. Their provenance is recorded alongside the files in `public/audio/drums/LICENSE.md`.

Microphone processing stays in the browser. Capture requests echo cancellation, noise suppression, and automatic gain control off. Browser and operating-system audio processing may still vary by device.

For reliable results, prefer a bass through an audio interface or a nearby amplifier. An unplugged solid-body bass usually produces too little acoustic energy for a laptop microphone, especially at low B.
