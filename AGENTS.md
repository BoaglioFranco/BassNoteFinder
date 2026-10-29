# Agent notes

Keep this app a focused personal tool. Prefer direct, compact interactions over product-style onboarding, dashboards, or explanatory UI.

## Commands

- `npm run dev` — Vite development server; it automatically selects another port when 5173 is occupied.
- `npm test -- --run` — full Vitest suite.
- `npm run build` — TypeScript and production build check.

Run tests and the build after behavior or dependency changes. Verify layout changes in a real browser at desktop and mobile widths.

## Stack and boundaries

- React, TypeScript, Vite, and TanStack Router.
- Mantine v9 provides the shell and standard controls. The grayscale theme lives in `src/theme.ts`; do not introduce unrelated accent colors.
- Tone.js is pinned to `15.1.22`. Keep Tone-specific code inside `src/audio/toneAdapter.ts`.
- VexFlow renders bass-clef notation and is dynamically imported only when needed.
- The Beat Ruler grid is intentionally custom because its pointer geometry, dragging, and resizing are domain-specific.

## Where things live

- `src/App.tsx` — routes, microphone lifecycle, Note Finder, tuner, and shared shell.
- `src/exercise.ts` — target generation and note matching.
- `src/audio/microphone.ts`, `pitch.ts`, `stability.ts` — microphone analysis pipeline.
- `src/Metronome.tsx`, `src/audio/metronome.ts` — metronome UI and engine.
- `src/BeatRuler.tsx`, `src/rhythm/beatRuler.ts`, `src/audio/beatRuler.ts` — rhythm editor rules, UI, and playback.
- `src/rhythm/pattern.ts` — library-neutral rhythm data on a canonical 16th-note grid.
- `src/styles.css` — custom responsive layout and music-tool visuals.

## Invariants worth preserving

- Note-name mode matches pitch class in any octave; bass-clef mode matches exact MIDI pitch.
- Stable correct notes advance automatically and ignore the held tail of the previous note.
- Navigating to a timing tool stops an active microphone analyzer.
- Rhythm events store attack and duration in sixteenth-note steps, stay within pattern bounds, and cannot overlap.
- Beat Ruler patterns support 1–4 bars and persist in `localStorage`; metronome and exercise settings also persist.
- Audio engines must stop and dispose cleanly on navigation or unmount.
- Preserve accessible names, keyboard behavior, and existing test IDs when restyling controls.
