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

Microphone processing stays in the browser. Capture requests echo cancellation, noise suppression, and automatic gain control off. Browser and operating-system audio processing may still vary by device.

For reliable results, prefer a bass through an audio interface or a nearby amplifier. An unplugged solid-body bass usually produces too little acoustic energy for a laptop microphone, especially at low B.
