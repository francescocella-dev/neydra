import { expect,it } from 'vitest';
import { AvatarEngine } from '../src/engine/AvatarEngine';
import { holoSpeech } from '../src/speech-profile';

it('softens authored speech without changing blink, source frame or cancellation',()=>{
  const frame=new AvatarEngine().sample(0).face;
  const input={...frame,eyeBlinkLeft:1,viseme_aa:1,viseme_oh:1,viseme_ou:1};
  const capped=holoSpeech(input);
  expect(capped.viseme_aa).toBe(0.58);
  expect(capped.viseme_oh).toBe(0.42);
  expect(capped.viseme_ou).toBe(0.38);
  expect(capped.eyeBlinkLeft).toBe(1);
  expect(input.viseme_aa).toBe(1);
  expect(holoSpeech(frame).viseme_aa).toBe(0);
});
