import type { FacialFrame } from './engine/protocol';

/** Renderer-only envelope. Cue timing, channel mapping and data stay intact. */
export function holoSpeech(frame: FacialFrame): FacialFrame {
  const result = { ...frame };
  const caps = { viseme_aa: 0.58, viseme_ee: 0.50, viseme_ih: 0.45, viseme_oh: 0.42,
    viseme_ou: 0.38, viseme_ff: 0.52, viseme_mm: 0.55 } as const;
  for (const key of Object.keys(caps) as (keyof typeof caps)[]) {
    const value = Math.max(0,Math.min(1,frame[key]));
    result[key] = value*value*(3-2*value)*caps[key];
  }
  return result;
}
