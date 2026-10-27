import type { Viseme, VisemeCue } from "./protocol";
/** Synthetic phoneme-like timings, NOT audio alignment or a TTS implementation. */
export const DEMO_CAPTION = "Ciao, sono Neydra. Sono qui per aiutarti.";
export const DEMO_DURATION = 4800;
const TIMINGS: readonly [Viseme, number, number][] = [
  ["ee", 100, 180],
  ["aa", 250, 280],
  ["oh", 650, 220],
  ["oh", 930, 200],
  ["ee", 1300, 180],
  ["aa", 1560, 300],
  ["oh", 2100, 210],
  ["oh", 2370, 210],
  ["ou", 2680, 180],
  ["ih", 2880, 180],
  ["ee", 3200, 220],
  ["aa", 3500, 250],
  ["ih", 3780, 180],
  ["ou", 3980, 200],
  ["aa", 4210, 220],
  ["ih", 4490, 180],
];
export const DEMO_CUES: readonly VisemeCue[] = TIMINGS.map(
  ([viseme, timestamp, duration]) => ({
    viseme,
    timestamp,
    duration,
    weight: 0.85,
  }),
);
