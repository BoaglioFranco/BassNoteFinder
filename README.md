# Bass Note Finder

A hands-free note-reading trainer for a standard five-string bass in B–E–A–D–G tuning. It supports two endless practice modes:

- **Note name:** play the requested pitch class in any octave.
- **Bass clef:** play the exact written pitch from B0 through G3 (the instrument's first 12 frets). Notation follows the standard electric-bass convention and is written one octave above sounding pitch.

Stable correct notes briefly turn the screen green and advance automatically. Stable wrong notes produce red feedback. Sharps and flats are mixed throughout the exercises. The original diagnostic tuner remains available from the page footer.

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
```

The main orchestration and UI live in `src/App.tsx`. Target generation and matching live in `src/exercise.ts`. Microphone capture, pitch detection, and stability tracking live under `src/audio/`.

## Audio notes

Microphone processing stays in the browser. Capture requests echo cancellation, noise suppression, and automatic gain control off. Browser and operating-system audio processing may still vary by device.

For reliable results, prefer a bass through an audio interface or a nearby amplifier. An unplugged solid-body bass usually produces too little acoustic energy for a laptop microphone, especially at low B.
