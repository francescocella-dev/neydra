import { test,expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';

test('V3 light face, reversible anchored aura, accessible particles and real recording',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/?version=v3');
  await page.waitForFunction(()=>window.holoLab?.ready);
  await mkdir('evidence',{recursive:true});
  await page.evaluate(()=>{window.holoLab.vfxTime(0);window.holoLab.pose('neutral');window.holoLab.progress(1);});
  const rms=(a:number[],b:number[])=>Math.sqrt(a.reduce((sum,v,i)=>sum+(v-b[i])**2,0)/a.length);
  const at=async(p:number)=>page.evaluate(p=>{window.holoLab.progress(p);return window.holoLab.pixels();},p);
  const auraInitial=await page.evaluate(()=>window.holoLab.vfx());
  expect(auraInitial.parentIsHead).toBe(true);
  expect(auraInitial.budget).toEqual({pixels:320,halo:96,flow:160});
  expect(auraInitial.drawCalls).toBe(2);
  const initialMatrix=auraInitial.worldMatrix;
  await page.evaluate(()=>window.holoLab.headYaw(0.3));
  expect(await page.evaluate(()=>window.holoLab.vfx().worldMatrix)).not.toEqual(initialMatrix);
  await page.evaluate(()=>window.holoLab.headYaw(0));

  // Actual framebuffer aura presence, slow movement and deterministic replay.
  const edgeOn=await page.evaluate(()=>window.holoLab.pixels('edge'));
  await page.evaluate(()=>window.holoLab.effects(false));
  const edgeOff=await page.evaluate(()=>window.holoLab.pixels('edge'));
  expect(rms(edgeOn,edgeOff)).toBeGreaterThan(0.03);
  await page.evaluate(()=>{window.holoLab.effects(true);window.holoLab.vfxTime(4);});
  const drifting=await page.evaluate(()=>window.holoLab.pixels('edge'));
  expect(rms(edgeOn,drifting)).toBeGreaterThan(0.03);
  await page.evaluate(()=>window.holoLab.vfxTime(0));
  expect(await page.evaluate(()=>window.holoLab.pixels('edge'))).toEqual(edgeOn);

  for(const profile of ['v2','v3']) {
    await page.selectOption('#version',profile);
    await at(1);
    await page.screenshot({path:`evidence/v3-compare-${profile}-normal.png`});
    await page.locator('#markers').check();
    await page.screenshot({path:`evidence/v3-compare-${profile}-markers.png`});
    await page.locator('#markers').uncheck();
  }
  const background=await at(0);
  await page.locator('#markers').check();
  const reference=await at(0),withHead=await at(1);
  await page.locator('#markers').uncheck();
  const complete=await at(1);
  const transmission=rms(withHead,complete)/rms(reference,background);
  expect(transmission).toBeGreaterThan(0.45);
  expect(transmission).toBeLessThan(0.9);

  const middle=await at(0.42);
  const ratios:number[]=[];
  for(let y=0;y<24;y++){
    let sum=0,count=0;
    for(let x=0;x<24;x++){
      const i=(y*24+x)*3;
      const finalSignal=Math.hypot(...complete.slice(i,i+3).map((v,j)=>v-background[i+j]));
      if(finalSignal>6){sum+=Math.min(1,Math.hypot(...middle.slice(i,i+3).map((v,j)=>v-background[i+j]))/finalSignal);count++;}
    }
    ratios.push(sum/Math.max(count,1));
  }
  const lower=ratios.slice(0,6).reduce((a,b)=>a+b,0)/6;
  const upper=ratios.slice(-6).reduce((a,b)=>a+b,0)/6;
  expect(lower-upper).toBeGreaterThan(0.12);
  const continuity:number[]=[];
  let previous=await at(0.4);
  for(const p of [0.42,0.44,0.46,0.48,0.5]){const next=await at(p);continuity.push(rms(previous,next)/255);previous=next;}
  expect(Math.max(...continuity)).toBeLessThan(0.05);
  const endpointSteps:number[]=[];
  previous=await at(0.94);
  for(const p of [0.96,0.98,1]){const next=await at(p);endpointSteps.push(rms(previous,next)/255);previous=next;}
  expect(Math.max(...endpointSteps)).toBeLessThan(0.04);

  for(const p of [0,0.25,0.5,0.75,1]){
    await at(p);await page.screenshot({path:`evidence/v3-progress-${p*100}.png`});
  }
  const fieldAtHalf=await at(0.5);
  const transitionDraw=await page.evaluate(()=>({...window.holoLab.snapshot().renderer}));
  expect(transitionDraw.calls).toBeLessThanOrEqual(10);
  expect(transitionDraw.points).toBe(576);
  await at(0.7);await at(0.5);
  expect(await page.evaluate(()=>window.holoLab.pixels())).toEqual(fieldAtHalf);
  await page.screenshot({path:'evidence/v3-exit-50.png'});
  await at(1);
  for(const [view,pose,name] of [['front','neutral','stable'],['three-quarter','neutral','three-quarter'],
    ['front','blinkLeft','blink-left'],['front','blinkRight','blink-right'],['front','blink','blink-closed'],
    ['front','open','mouth-open'],['front','close','mouth-close']]){
    await page.evaluate(({view,pose})=>{window.holoLab.view(view);window.holoLab.pose(pose);},{view,pose});
    await page.screenshot({path:`evidence/v3-${name}.png`});
  }
  await page.evaluate(()=>{window.holoLab.pose('neutral');window.holoLab.view('front');});
  const canvas=await page.locator('canvas').boundingBox();
  if(!canvas)throw new Error('No WebGL canvas');
  await page.screenshot({path:'evidence/v3-face-detail.png',clip:{x:canvas.x+canvas.width*0.32,y:canvas.y+canvas.height*0.24,width:canvas.width*0.36,height:canvas.height*0.46}});
  await page.screenshot({path:'evidence/v3-edge-detail.png',clip:{x:canvas.x+canvas.width*0.29,y:canvas.y+canvas.height*0.08,width:canvas.width*0.18,height:canvas.height*0.68}});
  await page.locator('#speech').click();
  await page.waitForTimeout(1000);
  await page.screenshot({path:'evidence/v3-speaking.png'});
  await page.locator('#stop').click();
  expect(await page.evaluate(()=>Object.entries(window.holoLab.snapshot().weights).filter(([n])=>n.startsWith('viseme')||n==='jawOpen').every(([,w])=>w===0))).toBe(true);
  await page.locator('#dismiss').click();await page.waitForTimeout(200);
  const before=await page.evaluate(()=>window.holoLab.snapshot().progress);
  await page.locator('#reverse').click();
  expect(Math.abs((await page.evaluate(()=>window.holoLab.snapshot().progress))-before)).toBeLessThan(0.15);
  await expect.poll(()=>page.evaluate(()=>window.holoLab.snapshot().progress)).toBe(1);
  await page.locator('#reduced').check();
  await page.evaluate(()=>{window.holoLab.pose('neutral');window.holoLab.vfxTime(1);});
  const still=await page.evaluate(()=>window.holoLab.pixels('edge'));
  await page.evaluate(()=>window.holoLab.vfxTime(100));
  expect(await page.evaluate(()=>window.holoLab.pixels('edge'))).toEqual(still);
  expect(await page.evaluate(()=>window.holoLab.vfx())).toMatchObject({moving:false,time:0,drawCalls:1});
  await page.screenshot({path:'evidence/v3-reduced-motion.png'});
  await page.locator('#dismiss').click();
  await expect.poll(()=>page.evaluate(()=>window.holoLab.snapshot().progress)).toBe(0);
  expect(await page.evaluate(()=>window.holoLab.vfx().visible)).toBe(false);
  expect(await page.evaluate(()=>window.holoLab.snapshot().renderer.points)).toBe(0);
  await page.locator('#appear').click();
  await expect.poll(()=>page.evaluate(()=>window.holoLab.snapshot().progress)).toBe(1);
  await page.locator('#reduced').uncheck();
  for(const viewport of [{width:720,height:480},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.waitForTimeout(100);
    expect(await page.evaluate(()=>window.holoLab.vfx().budget.pixels)).toBe(160);
    await page.screenshot({path:`evidence/v3-${viewport.width}.png`});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.evaluate(()=>{window.holoLab.view('front');window.holoLab.vfxTime(null);});
  const paired:Record<string,unknown>={};
  for(const profile of ['v2','v3']){
    await page.selectOption('#version',profile);await at(1);await page.waitForTimeout(250);
    await page.evaluate(()=>window.holoLab.performance(true));await page.waitForTimeout(2000);
    paired[profile]=await page.evaluate(()=>({timing:window.holoLab.performance(),draw:window.holoLab.snapshot().renderer,vfx:window.holoLab.vfx()}));
    expect(await page.evaluate(()=>window.holoLab.snapshot().renderer.calls)).toBeLessThanOrEqual(12);
  }
  await page.evaluate(()=>{window.holoLab.progress(0);window.holoLab.performance(true);
    const recorder=new MediaRecorder(document.querySelector('canvas')!.captureStream(24),{mimeType:'video/webm'});
    const chunks:Blob[]=[];recorder.ondataavailable=e=>chunks.push(e.data);
    const done=new Promise<string>(resolve=>{recorder.onstop=async()=>{
      const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let data='';for(const byte of bytes)data+=String.fromCharCode(byte);resolve(btoa(data));};});
    Object.assign(window,{recording:{recorder,done}});recorder.start();
  });
  await page.locator('#demo').click();await page.waitForTimeout(7500);
  const video=await page.evaluate(async()=>{const r=(window as unknown as{recording:{recorder:MediaRecorder;done:Promise<string>}}).recording;r.recorder.stop();return await r.done;});
  await writeFile('evidence/demonstration-v3.webm',Buffer.from(video,'base64'));
  expect(await page.evaluate(()=>window.holoLab.snapshot().progress)).toBe(0);
  expect(await page.evaluate(()=>window.holoLab.vfx().visible)).toBe(false);
  expect(errors).toEqual([]);
  await writeFile('evidence/browser-review-v3.json',JSON.stringify({status:'PASS',transmission,lower,upper,ratios,continuity,endpointSteps,transitionDraw,
    auraInitial,paired,recordingTiming:await page.evaluate(()=>window.holoLab.performance()),errors,
    environment:'Windows headless Edge; animation-loop samples, not foreground GPU certification',speech:'Synthetic cues; silent'},null,2)+'\n');
});
