import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('actual approved GLB, independent morphs, projection and cancellation', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  await page.goto('/?version=v2');
  await expect(page.locator('#status')).not.toContainText('BLOCKED');
  await page.waitForFunction(() => window.holoLab?.ready);
  await mkdir('local/v2-regression', { recursive: true });
  const geometry: Record<string, unknown> = {};
  for (const [name, pose] of [['eyeBlinkLeft', 'blinkLeft'], ['eyeBlinkRight', 'blinkRight'], ['jawOpen', 'open'], ['mouthClose', 'close'], ['mouthPucker', 'pucker'], ['mouthFunnel', 'funnel']]) {
    const result = await page.evaluate(({ name, pose }) => {
      const lab = window.holoLab;
      lab.pose('neutral');
      const delta = lab.morphGeometry(name);
      const before = lab.vertex(delta.extremeIndex);
      lab.pose(pose);
      const after = lab.vertex(delta.extremeIndex);
      const distance = Math.hypot(...after.map((v, i) => v - before[i]));
      return { ...delta, distance, weights: lab.snapshot().weights };
    }, { name, pose });
    expect(result.changed).toBeGreaterThan(20);
    expect(result.maximum).toBeGreaterThan(0.001);
    expect(result.distance).toBeGreaterThan(0.0001);
    if (name === 'eyeBlinkLeft') expect(result.weights.eyeBlinkRight).toBe(0);
    if (name === 'eyeBlinkRight') expect(result.weights.eyeBlinkLeft).toBe(0);
    geometry[name] = result;
  }
  for (const name of ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_FF', 'viseme_PP']) {
    const result = await page.evaluate(name => window.holoLab.morphGeometry(name), name);
    expect(result.changed).toBeGreaterThan(20);
    geometry[name] = result;
  }
  const left = await page.evaluate(() => window.holoLab.morphGeometry('eyeBlinkLeft'));
  const right = await page.evaluate(() => window.holoLab.morphGeometry('eyeBlinkRight'));
  expect(left.meanX * right.meanX).toBeLessThan(0);
  const pixelsAt=async (progress:number)=>page.evaluate(p=>{window.holoLab.progress(p);return window.holoLab.pixels();},progress);
  const rms=(a:number[],b:number[])=>Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/a.length);
  await page.evaluate(()=>window.holoLab.pose('neutral'));
  const irisOn=await pixelsAt(1);
  await page.screenshot({path:'local/v2-regression/v2-iris-on.png'});
  await page.locator('#iris').uncheck();
  const irisOff=await pixelsAt(1);
  const irisDifference=rms(irisOn,irisOff);
  expect(irisDifference).toBeGreaterThan(0.02);
  await page.screenshot({path:'local/v2-regression/v2-iris-off.png'});
  await page.locator('#iris').check();
  await page.evaluate(()=>window.holoLab.pose('blink'));
  const irisClosed=await page.evaluate(()=>window.holoLab.pixels());
  await page.locator('#iris').uncheck();
  expect(rms(irisClosed,await page.evaluate(()=>window.holoLab.pixels()))).toBe(0);
  await page.locator('#iris').check();
  await page.evaluate(()=>window.holoLab.pose('neutral'));
  const background=await pixelsAt(0);
  await page.locator('#markers').check();
  const backgroundMarkers=await pixelsAt(0);
  const headMarkers=await pixelsAt(1);
  await page.screenshot({path:'local/v2-regression/v2-translucency-dark.png'});
  await page.locator('#light').check();
  await page.screenshot({path:'local/v2-regression/v2-translucency-light.png'});
  await page.locator('#light').uncheck();
  await page.locator('#markers').uncheck();
  const headWithoutMarkers=await pixelsAt(1);
  const transmission=rms(headMarkers,headWithoutMarkers)/rms(backgroundMarkers,background);
  expect(transmission).toBeGreaterThan(0.12);
  expect(transmission).toBeLessThan(0.9);
  await page.locator('#neutral').check();
  const opaque=await pixelsAt(1);
  await page.locator('#markers').check();
  const opaqueMarkers=await pixelsAt(1);
  await page.screenshot({path:'local/v2-regression/v2-translucency-neutral.png'});
  expect(rms(opaqueMarkers,opaque)/rms(backgroundMarkers,background)).toBeLessThan(0.1);
  await page.locator('#markers').uncheck();
  await page.locator('#neutral').uncheck();
  const full=await pixelsAt(1);
  const middle=await pixelsAt(0.5);
  let partialRows=0;
  for(let y=0;y<24;y++) {
    let partial=0;
    for(let x=0;x<24;x++) {
      const i=(y*24+x)*3;
      const finalSignal=Math.hypot(...full.slice(i,i+3).map((v,j)=>v-background[i+j]));
      const signal=Math.hypot(...middle.slice(i,i+3).map((v,j)=>v-background[i+j]));
      const ratio=signal/finalSignal;
      if(finalSignal>5 && ratio>0.08 && ratio<0.9) partial++;
    }
    if(partial>6) partialRows++;
  }
  expect(partialRows).toBeGreaterThan(12);
  const continuity:number[]=[];
  let previous=await pixelsAt(0.44);
  for(const p of [0.46,0.48,0.50,0.52,0.54]) {
    const next=await pixelsAt(p);continuity.push(rms(previous,next)/255);previous=next;
  }
  expect(Math.max(...continuity)).toBeLessThan(0.04);
  await page.evaluate(() => { window.holoLab.pose('neutral'); window.holoLab.progress(1); });
  for (const [view, pose, name] of [
    ['front', 'neutral', 'front'], ['three-quarter', 'neutral', 'three-quarter'], ['profile', 'neutral', 'profile'],
    ['front', 'blinkLeft', 'blink-left'], ['front', 'blinkRight', 'blink-right'], ['front', 'blink', 'blink-closed'],
    ['front', 'open', 'mouth-open'], ['front', 'close', 'mouth-close'], ['front', 'pucker', 'mouth-pucker'],
    ['front', 'smile', 'smile'], ['front', 'gaze', 'gaze'],
  ]) {
    await page.evaluate(({ view, pose }) => { window.holoLab.view(view); window.holoLab.pose(pose); }, { view, pose });
    await page.screenshot({ path: `local/v2-regression/v2-${name}.png` });
  }
  await page.evaluate(() => window.holoLab.pose('neutral'));
  await page.locator('#neutral').check();
  await page.screenshot({ path: 'local/v2-regression/v2-neutral-material.png' });
  await page.locator('#neutral').uncheck();
  await page.locator('#light').check();
  await page.screenshot({ path: 'local/v2-regression/v2-light-background.png' });
  await page.locator('#light').uncheck();
  for (const value of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate(value => window.holoLab.progress(value), value);
    await page.screenshot({ path: `local/v2-regression/v2-progress-${value * 100}.png` });
  }
  await page.evaluate(()=>window.holoLab.progress(0.5));
  await page.screenshot({path:'local/v2-regression/v2-exit-50.png'});
  await page.evaluate(()=>window.holoLab.progress(1));
  await page.locator('#demo').click();
  await expect.poll(() => page.evaluate(() => window.holoLab.snapshot().progress)).toBeGreaterThan(0.9);
  await expect.poll(() => page.evaluate(() => window.holoLab.snapshot().state)).toBe('speaking');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'local/v2-regression/v2-speaking-simulated.png' });
  const speechWeights=await page.evaluate(()=>window.holoLab.snapshot().weights);
  expect(speechWeights.viseme_O).toBeLessThanOrEqual(0.42);
  expect(speechWeights.viseme_U).toBeLessThanOrEqual(0.38);
  await page.locator('#stop').click();
  expect(await page.evaluate(() => Object.entries(window.holoLab.snapshot().weights).filter(([n]) => n.startsWith('viseme') || n === 'jawOpen').every(([, w]) => w === 0))).toBe(true);
  await page.locator('#dismiss').click();
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => window.holoLab.snapshot().progress);
  await page.locator('#reverse').click();
  const after = await page.evaluate(() => window.holoLab.snapshot().progress);
  expect(Math.abs(after - before)).toBeLessThan(0.15);
  await expect.poll(() => page.evaluate(() => window.holoLab.snapshot().progress)).toBe(1);
  await page.locator('#reduced').check();
  await page.locator('#dismiss').click();
  await expect.poll(() => page.evaluate(() => window.holoLab.snapshot().progress)).toBe(0);
  expect(await page.evaluate(() => window.holoLab.snapshot().beamVisible)).toBe(false);
  await page.locator('#appear').click();
  await expect.poll(() => page.evaluate(() => window.holoLab.snapshot().progress)).toBe(1);
  await page.screenshot({ path: 'local/v2-regression/v2-reduced-motion.png' });
  for (const state of ['idle', 'listening', 'processing', 'speaking', 'interrupted', 'error']) {
    await page.selectOption('#state', state);
    expect(await page.evaluate(() => window.holoLab.snapshot().state)).toBe(state);
  }
  await page.setViewportSize({ width: 720, height: 480 });
  await page.screenshot({ path: 'local/v2-regression/v2-narrow.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'local/v2-regression/v2-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('#reduced').uncheck();
  await page.evaluate(()=>{ window.holoLab.progress(0); window.holoLab.performance(true); });
  // Record the actual WebGL canvas with the browser's own encoder. This avoids
  // installing a second system/Playwright ffmpeg just to capture a local POC.
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const recorder = new MediaRecorder(canvas.captureStream(24), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise<string>(resolve => { recorder.onstop = async () => {
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
      let value = ''; for (const byte of bytes) value += String.fromCharCode(byte);
      resolve(btoa(value));
    }; });
    Object.assign(window, { recording: { recorder, done } });
    recorder.start();
  });
  await page.locator('#demo').click();
  await page.waitForTimeout(7500);
  const video = await page.evaluate(async () => {
    const recording = (window as unknown as { recording: { recorder: MediaRecorder; done: Promise<string> } }).recording;
    recording.recorder.stop(); return await recording.done;
  });
  await writeFile('local/v2-regression/demonstration-v2.webm', Buffer.from(video, 'base64'));
  expect(await page.evaluate(() => window.holoLab.snapshot().progress)).toBe(0);
  expect(errors).toEqual([]);
  expect(requests.every(url => url.startsWith('http://127.0.0.1:4173/') || url.startsWith('data:') || url.startsWith('blob:'))).toBe(true);
  const runtime = await page.evaluate(() => window.holoLab.snapshot());
  const performanceSample=await page.evaluate(()=>window.holoLab.performance());
  await writeFile('local/v2-regression/browser-review-v2.json', JSON.stringify({ status: 'PASS', runtime, geometry, errors,
    transmission,partialRows,continuity,performanceSample,speechWeights,irisDifference,
    environment: 'Windows, headless Edge WebGL; not a foreground GPU performance gate',
    speech: 'Simulated visemes only, no audio, no microphone or TTS' }, null, 2) + '\n');
});
