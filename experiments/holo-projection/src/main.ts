import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { inspectGlb, validateScene, rigReport } from './assets';
import { Projection } from './projection';
import { holoMaterial } from './material';
import { projectionBeam } from './beam';
import { holoSpeech } from './speech-profile';
import { applyFace, setMorph } from './rig';
import { AvatarEngine } from './engine/AvatarEngine';
import { DEMO_CAPTION, DEMO_CUES, DEMO_DURATION } from './engine/demo';
import { AVATAR_STATES, type AvatarState } from './engine/protocol';
import tokens from '../spec/holo.tokens.json';
import './style.css';

const element = <T extends HTMLElement>(id: string) => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element ${id}`);
  return node as T;
};
const status = element('status');
const stage = element('stage');
const progressInput = element<HTMLInputElement>('progress');
const reducedInput = element<HTMLInputElement>('reduced');
const poseInput = element<HTMLSelectElement>('pose');
const stateInput = element<HTMLSelectElement>('state');
const caption = element('caption');

async function start() {
  const response = await fetch('/holo-head.glb');
  if (!response.ok) throw new Error('GLB assente: eseguire npm run pipeline prima del viewer.');
  const data = await response.arrayBuffer();
  inspectGlb(data);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  validateScene(gltf);
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });
  if (meshes.length !== 1) throw new Error('Expected exactly one derived head mesh');
  const head = meshes[0];
  if (!head.morphTargetDictionary || !head.morphTargetInfluences) throw new Error('Missing facial morph targets');
  // Use neutral geometry, not Three's conservative union of all morph extremes.
  const box = new THREE.Box3().setFromBufferAttribute(head.geometry.attributes.position as THREE.BufferAttribute);
  box.applyMatrix4(head.matrixWorld);
  const height = box.max.y - box.min.y;
  const shader = holoMaterial(box.min.y, box.max.y);
  const sourceMaterials = new Set<THREE.Material>();
  for (const mesh of meshes) {
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) sourceMaterials.add(mat);
    mesh.material = shader.material;
  }
  sourceMaterials.forEach(mat => mat.dispose());
  // Transparent triangles inside one mesh are not sorted individually. A masked
  // depth prepass prevents the inner mouth/eye surfaces leaking through cheeks.
  const depthMaterial = shader.material.clone();
  depthMaterial.onBeforeCompile = shader.material.onBeforeCompile;
  depthMaterial.transparent = false;
  depthMaterial.colorWrite = false;
  const depthHead = new THREE.Mesh(head.geometry, depthMaterial);
  depthHead.morphTargetInfluences = head.morphTargetInfluences;
  depthHead.morphTargetDictionary = head.morphTargetDictionary;
  depthHead.renderOrder = -2;
  head.add(depthHead);
  shader.material.depthWrite = false;
  shader.material.depthFunc = THREE.EqualDepth;
  const scene = new THREE.Scene();
  // The canvas itself contains the background, so WebGL recordings retain it.
  scene.background = new THREE.Color(tokens.palette.backgroundMid);
  const backdropMaterial = new THREE.ShaderMaterial({
    uniforms: { uLight: { value: 0 } }, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float uLight;
      void main(){ float glow=exp(-dot((vUv-0.5)*4.0,(vUv-0.5)*4.0));
      vec3 color=mix(vec3(0.016,0.063,0.122),vec3(0.071,0.212,0.361),glow);
      gl_FragColor=vec4(mix(color,vec3(0.42,0.58,0.70),uLight),1.0); }`,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(height*7,height*7),backdropMaterial);
  backdrop.position.z=-height*1.1;
  backdrop.renderOrder=-100;
  scene.add(backdrop);
  const markerPoints: THREE.Vector3[] = [];
  for (let n=-6;n<=6;n++) {
    const d=n*height*0.10;
    markerPoints.push(new THREE.Vector3(d,-height,0),new THREE.Vector3(d,height,0));
    markerPoints.push(new THREE.Vector3(-height,d,0),new THREE.Vector3(height,d,0));
  }
  const markers = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(markerPoints),
    new THREE.LineBasicMaterial({color: tokens.palette.stroke}));
  markers.position.z=-height*0.8;
  markers.renderOrder=-90;
  markers.visible=false;
  scene.add(markers);
  const pivot = new THREE.Group();
  pivot.add(gltf.scene);
  scene.add(pivot);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(tokens.palette.backgroundMid, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.append(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
  const target = new THREE.Vector3(0, -height * 0.12, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.minDistance = height * 0.85;
  controls.maxDistance = height * 5;
  controls.maxPolarAngle = Math.PI * 0.7;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.enablePan = false;
  const view = (name: string) => {
    const angle = name === 'profile' ? Math.PI / 2 : name === 'three-quarter' ? Math.PI / 5 : 0;
    camera.position.set(Math.sin(angle) * height * 2.7, height * 0.03, Math.cos(angle) * height * 2.7);
    controls.target.copy(target);
    controls.update();
  };
  view('front');
  scene.add(new THREE.HemisphereLight(0xd5f6ff, 0x10263d, 2));
  const key = new THREE.DirectionalLight(0xd5f6ff, 2.2);
  key.position.set(-1, 1.5, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x348dff, 1.1);
  rim.position.set(1, 0.2, -1);
  scene.add(rim);

  const originY = box.min.y - height * 0.35;
  const apertureMaterial = new THREE.MeshBasicMaterial({ color: tokens.palette.primary, transparent: true, opacity: 0.6 });
  const aperture = new THREE.Mesh(new THREE.RingGeometry(height * 0.025, height * 0.031, 64), apertureMaterial);
  aperture.rotation.x = -Math.PI / 2;
  aperture.position.set(0, originY, 0);
  scene.add(aperture);
  const beamEffect = projectionBeam(height,originY);
  const beam = beamEffect.group;
  scene.add(beam);

  const projection = new Projection();
  projection.seek(1);
  const engine = new AvatarEngine();
  let speechId = 0;
  let demoStart: number | null = null;
  let autoSpeech = false;
  let elapsedDemo = 0;
  let ending = false;
  let now = performance.now();
  let inspection = true;
  let visibleTarget = true;
  let manualProgress: number | null = null;
  let neutral = false;
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = (enabled: boolean) => {
    reducedInput.checked = enabled;
    projection.setReducedMotion(enabled, performance.now());
    engine.dispatch({ type: 'reducedMotionChanged', enabled });
    shader.uniforms.uReduced.value = Number(enabled);
  };
  reduced(reducedQuery.matches);
  reducedQuery.addEventListener('change', event => reduced(event.matches));
  const cancel = () => {
    demoStart = null;
    const id = engine.getSnapshot().speech?.id;
    if (id) engine.dispatch({ type: 'speechCancelled', speechId: id });
    stateInput.value = engine.getSnapshot().state;
    caption.textContent = 'Interrotto · bocca neutra · nessun audio';
    poseInput.value = 'neutral';
    head.morphTargetInfluences!.fill(0);
    inspection = true;
  };
  const transition = (visible: boolean) => {
    manualProgress = null;
    visibleTarget = visible;
    projection.to(visible, performance.now());
  };
  const speech = (at: number) => {
    inspection = false;
    const id = `simulated-${++speechId}`;
    engine.dispatch({ type: 'speechStarted', speechId: id, startedAt: at });
    for (const cue of DEMO_CUES) engine.dispatch({ type: 'viseme', speechId: id, cue });
    stateInput.value = 'speaking';
    caption.textContent = `${DEMO_CAPTION} · visemi simulati, nessun audio`;
  };
  element('appear').onclick = () => { demoStart = null; transition(true); };
  element('dismiss').onclick = () => { demoStart = null; transition(false); };
  element('reverse').onclick = () => { demoStart = null; transition(!visibleTarget); };
  element('stop').onclick = cancel;
  element('speech').onclick = () => { cancel(); speech(performance.now()); };
  element('demo').onclick = () => {
    cancel();
    projection.seek(0);
    transition(true);
    demoStart = performance.now();
    autoSpeech = false;
    ending = false;
    inspection = false;
    caption.textContent = 'Apparizione → parlato simulato → scomparsa';
  };
  progressInput.oninput = () => {
    demoStart = null;
    manualProgress = Number(progressInput.value);
    projection.seek(manualProgress);
    visibleTarget = manualProgress > 0.5;
  };
  reducedInput.onchange = () => reduced(reducedInput.checked);
  element<HTMLInputElement>('neutral').onchange = event => {
    neutral = (event.target as HTMLInputElement).checked;
    shader.uniforms.uHolo.value = neutral ? 0 : 1;
    shader.material.color.set(neutral ? '#aab7c2' : tokens.palette.primary);
    shader.material.emissiveIntensity = neutral ? 0 : 0.045;
  };
  element<HTMLInputElement>('light').onchange = event => {
    backdropMaterial.uniforms.uLight.value = Number((event.target as HTMLInputElement).checked);
  };
  element<HTMLInputElement>('markers').onchange = event => { markers.visible=(event.target as HTMLInputElement).checked; };
  element<HTMLInputElement>('iris').onchange = event => { shader.uniforms.uIris.value=Number((event.target as HTMLInputElement).checked); };
  poseInput.onchange = () => { const pose = poseInput.value; cancel(); inspection = true; poseInput.value = pose; };
  stateInput.onchange = () => {
    const state = stateInput.value as AvatarState;
    cancel(); inspection = false;
    engine.dispatch({ type: 'stateChanged', state });
    stateInput.value = state;
  };
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => { button.onclick = () => view(button.dataset.view!); });

  const applyPose = () => {
    head.morphTargetInfluences!.fill(0);
    const pose = poseInput.value;
    if (pose === 'blinkLeft' || pose === 'blink') setMorph(head, 'eyeBlinkLeft', 1);
    if (pose === 'blinkRight' || pose === 'blink') setMorph(head, 'eyeBlinkRight', 1);
    if (pose === 'open' || pose === 'close') setMorph(head, 'jawOpen', 0.8);
    if (pose === 'close') setMorph(head, 'mouthClose', 0.8);
    if (pose === 'pucker') setMorph(head, 'mouthPucker', 1);
    if (pose === 'funnel') setMorph(head, 'mouthFunnel', 1);
    if (pose === 'smile') { setMorph(head, 'mouthSmileLeft', 0.25); setMorph(head, 'mouthSmileRight', 0.25); }
    if (pose === 'gaze') { setMorph(head, 'eyeLookInLeft', 0.4); setMorph(head, 'eyeLookOutRight', 0.4); }
  };
  let frameCount = 0;
  let frameMs = 0;
  let lastFrame = performance.now();
  const frameDurations: number[] = [];
  const render = () => {
    now = performance.now();
    elapsedDemo = demoStart === null ? 0 : now - demoStart;
    if (demoStart !== null && elapsedDemo >= 1350 && !autoSpeech) { speech(demoStart + 1350); autoSpeech = true; }
    if (demoStart !== null && elapsedDemo >= 1350 + DEMO_DURATION + 200 && !ending) { transition(false); ending = true; }
    const snapshot = engine.getSnapshot();
    if (snapshot.speech && now - snapshot.speech.startedAt > DEMO_DURATION) {
      engine.dispatch({ type: 'speechEnded', speechId: snapshot.speech.id });
      stateInput.value = 'idle';
    }
    const frame = engine.sample(now);
    if (inspection) { applyPose(); pivot.rotation.set(0, 0, 0); }
    else {
      applyFace(head, holoSpeech(frame.face));
      // Legacy engine drift is limited to the current Holo design envelopes.
      pivot.rotation.set(THREE.MathUtils.clamp(frame.pitch, -0.0175, 0.0175), THREE.MathUtils.clamp(frame.yaw, -0.0262, 0.0262), 0);
    }
    const p = manualProgress ?? projection.sample(now);
    shader.uniforms.uProgress.value = p;
    shader.uniforms.uBlinkLeft.value=head.morphTargetInfluences![head.morphTargetDictionary!.eyeBlinkLeft];
    shader.uniforms.uBlinkRight.value=head.morphTargetInfluences![head.morphTargetDictionary!.eyeBlinkRight];
    apertureMaterial.opacity = p * 0.42;
    beam.visible = !projection.reducedMotion && !neutral && p > 0;
    beamEffect.uniforms.uStrength.value = Math.min(1,p/0.3);
    beam.scale.y = Math.max(0.001,Math.min(1,(p-0.10)/0.28));
    if (document.activeElement !== progressInput) progressInput.value = String(p);
    element('percent').textContent = `${Math.round(p * 100)}%`;
    const accent = tokens.palette[tokens.stateAccent[engine.getSnapshot().state] as keyof typeof tokens.palette];
    apertureMaterial.color.set(accent);
    status.textContent = `${engine.getSnapshot().state} · ${rigReport(gltf)}`;
    controls.update();
    renderer.render(scene, camera);
    frameMs += now - lastFrame;
    frameDurations.push(now-lastFrame);
    if (frameDurations.length>6000) frameDurations.shift();
    frameCount++;
    lastFrame = now;
    if (frameCount % 60 === 0) element('metrics').textContent = `${renderer.info.render.triangles.toLocaleString('it')} triangoli · ${(frameMs / frameCount).toFixed(1)} ms/frame (campione locale)`;
  };
  const resize = () => {
    const width = stage.clientWidth, height = stage.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  renderer.setAnimationLoop(render);
  // Local deterministic inspection surface for genuine loaded-geometry tests.
  window.holoLab = {
    pose(name: string) { cancel(); inspection = true; poseInput.value = name; render(); },
    progress(value: number) { cancel(); projection.seek(value); manualProgress = projection.sample(performance.now()); render(); },
    pixels() {
      render();
      const context=renderer.getContext();
      const width=renderer.domElement.width,height=renderer.domElement.height;
      const buffer=new Uint8Array(width*height*4);
      context.readPixels(0,0,width,height,context.RGBA,context.UNSIGNED_BYTE,buffer);
      const values: number[]=[];
      // Fixed central facial rectangle, independent of background/controls.
      for(let y=0;y<24;y++) for(let x=0;x<24;x++) {
        const i=(Math.floor(height*(0.38+y*0.012))*width+Math.floor(width*(0.43+x*0.006)))*4;
        values.push(buffer[i],buffer[i+1],buffer[i+2]);
      }
      return values;
    },
    performance(reset=false) {
      const sorted=[...frameDurations].filter(t=>t>0).sort((a,b)=>a-b);
      const result={frames:sorted.length,medianMs:sorted[Math.floor(sorted.length*0.5)]??0,p95Ms:sorted[Math.floor(sorted.length*0.95)]??0};
      if(reset) frameDurations.length=0;
      return result;
    },
    view,
    vertex(index: number) { return head.getVertexPosition(index, new THREE.Vector3()).toArray(); },
    morphGeometry(name: string) {
      const index = head.morphTargetDictionary![name];
      const attr = head.geometry.morphAttributes.position![index];
      const base = head.geometry.attributes.position;
      let changed = 0, maximum = 0, extremeIndex = 0, sumX = 0;
      for (let i = 0; i < attr.count; i++) {
        const delta = new THREE.Vector3().fromBufferAttribute(attr, i);
        if (!head.geometry.morphTargetsRelative) delta.sub(new THREE.Vector3().fromBufferAttribute(base, i));
        const length = delta.length();
        if (!Number.isFinite(length)) throw new Error('Non-finite morph delta');
        if (length > 1e-7) { changed++; sumX += base.getX(i); }
        if (length > maximum) { maximum = length; extremeIndex = i; }
      }
      return { changed, maximum, extremeIndex, meanX: sumX / changed };
    },
    snapshot() { return { progress: shader.uniforms.uProgress.value, state: engine.getSnapshot().state,
      weights: Object.fromEntries(Object.entries(head.morphTargetDictionary!).map(([name, i]) => [name, head.morphTargetInfluences![i]])),
      renderer: renderer.info.render, webgl: renderer.getContext().getParameter(renderer.getContext().VERSION),
      reduced: projection.reducedMotion, beamVisible: beam.visible, states: AVATAR_STATES }; },
    ready: true,
  };
}

declare global { interface Window { holoLab: {
  ready: boolean; pose(name: string): void; progress(value: number): void; view(name: string): void;
  vertex(index: number): number[];
  pixels(): number[];
  performance(reset?: boolean): {frames:number;medianMs:number;p95Ms:number};
  morphGeometry(name: string): { changed: number; maximum: number; extremeIndex: number; meanX: number };
  snapshot(): { progress: number; state: string; weights: Record<string, number>; renderer: THREE.WebGLInfo['render']; webgl: string;
    reduced: boolean; beamVisible: boolean; states: readonly string[] };
} } }

start().catch(error => { status.textContent = `BLOCKED · ${String(error)}`; console.error(error); });
