import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AnimationMixer, Box3, Color, MathUtils, Vector3 } from "three";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { AvatarEngine } from "../engine/AvatarEngine";
import { disposeScene, inspectGlb, rigReport, validateScene } from "./assets";
export interface AssetSource {
  key: string;
  url?: string;
  data?: ArrayBuffer;
}
export interface CameraCommand {
  serial: number;
  action: "reset" | "left" | "right" | "in" | "out" | "face";
}
export interface FrameStats {
  frames: number;
  median: number;
  p95: number;
}
class StageBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="stage-failure" role="alert">
        WebGL indisponibile. Abilita l’accelerazione grafica e ricarica la
        pagina.
      </div>
    ) : (
      this.props.children
    );
  }
}
function CameraRig({
  command,
  reduced,
}: {
  command: CameraCommand;
  reduced: boolean;
}) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera), [camera]);
  useEffect(() => {
    controls.connect(gl.domElement);
    controls.target.set(0, 1.45, 0);
    controls.minDistance = 1.6;
    controls.maxDistance = 9;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI / 2 + 0.2;
    controls.enablePan = false;
    controls.update();
    return () => controls.dispose();
  }, [controls, gl]);
  useEffect(() => {
    controls.enableDamping = !reduced;
  }, [controls, reduced]);
  useEffect(() => {
    if (command.action === "reset") {
      camera.position.set(3.5, 2.35, 6.6);
      controls.target.set(0, 1.45, 0);
    }
    if (command.action === "face") {
      camera.position.set(0.3, 2.15, 2.3);
      controls.target.set(0, 2, 0);
    }
    if (command.action === "in" || command.action === "out")
      camera.position
        .sub(controls.target)
        .multiplyScalar(command.action === "in" ? 0.8 : 1.25)
        .clampLength(controls.minDistance, controls.maxDistance)
        .add(controls.target);
    if (command.action === "left" || command.action === "right")
      camera.position
        .sub(controls.target)
        .applyAxisAngle(
          new Vector3(0, 1, 0),
          command.action === "left" ? -0.3 : 0.3,
        )
        .add(controls.target);
    controls.update();
  }, [command, camera, controls]);
  useFrame(() => controls.update());
  return null;
}
function Rig({ gltf, engine }: { gltf: GLTF; engine: AvatarEngine }) {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const mixer = useMemo(() => new AnimationMixer(gltf.scene), [gltf]);
  const head = useMemo(() => gltf.scene.getObjectByName("Head"), [gltf]);
  const rest = useMemo(() => head?.rotation.clone(), [head]);
  const previous = useRef<ReturnType<AnimationMixer["clipAction"]> | null>(
    null,
  );
  const morphMeshes = useMemo(() => {
    const result: Mesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as Mesh).morphTargetInfluences) result.push(o as Mesh);
    });
    return result;
  }, [gltf]);
  const fit = useMemo(() => {
    const bounds = new Box3().setFromObject(gltf.scene);
    const size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    const scale = 2.8 / Math.max(size.x, size.y, size.z, 0.01);
    return {
      scale,
      position: [
        -center.x * scale,
        0.16 - bounds.min.y * scale,
        -center.z * scale,
      ] as [number, number, number],
    };
  }, [gltf]);
  useEffect(() => {
    const clip = gltf.animations.find((c) => c.name === snapshot.state);
    if (!clip) {
      previous.current?.fadeOut(0.16);
      previous.current = null;
      return;
    }
    const next = mixer.clipAction(clip);
    if (previous.current !== next) {
      next.reset().setEffectiveWeight(1).play();
      if (previous.current)
        next.crossFadeFrom(
          previous.current,
          snapshot.reducedMotion ? 0 : 0.16,
          true,
        );
      previous.current = next;
    }
  }, [gltf, mixer, snapshot.state, snapshot.reducedMotion]);
  useEffect(
    () => () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
    },
    [gltf, mixer],
  );
  useFrame((_, delta) => {
    if (snapshot.reducedMotion) {
      mixer.setTime(0);
    } else mixer.update(Math.min(delta, 0.05));
    const frame = engine.sample(performance.now());
    if (head && rest) {
      const factor = snapshot.reducedMotion
        ? 1
        : 1 - Math.exp(-Math.min(delta, 0.05) * 10);
      head.rotation.x = MathUtils.lerp(
        head.rotation.x,
        rest.x + frame.pitch,
        factor,
      );
      head.rotation.y = MathUtils.lerp(
        head.rotation.y,
        rest.y + frame.yaw,
        factor,
      );
      head.rotation.z = MathUtils.lerp(
        head.rotation.z,
        rest.z + frame.roll,
        factor,
      );
    }
    for (const mesh of morphMeshes) {
      const dict = mesh.morphTargetDictionary!,
        influences = mesh.morphTargetInfluences!;
      for (const [name, index] of Object.entries(dict))
        influences[index] = frame.face[name as keyof typeof frame.face] ?? 0;
    }
  });
  return (
    <group scale={fit.scale} position={fit.position}>
      <primitive object={gltf.scene} />
    </group>
  );
}
function Platform({ state }: { state: string }) {
  const glow =
    state === "error"
      ? "#ff9fae"
      : state === "processing"
        ? "#a59bff"
        : "#6ad9ff";
  const group = useRef<Group>(null);
  useEffect(() => {
    group.current?.traverse((obj) => {
      if ((obj as Mesh).isMesh && (obj as Mesh).name === "ring") {
        const material = (obj as Mesh).material as MeshStandardMaterial;
        material.emissive = new Color(glow);
        material.color = new Color(glow);
      }
    });
  }, [glow]);
  return (
    <group ref={group}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[1.55, 1.65, 0.13, 96]} />
        <meshStandardMaterial
          color="#0c1828"
          metalness={0.8}
          roughness={0.28}
        />
      </mesh>
      {[1.28, 1.5, 1.9].map((r, i) => (
        <mesh
          name="ring"
          key={r}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, i === 2 ? -0.015 : 0.1, 0]}
        >
          <torusGeometry args={[r, i === 2 ? 0.004 : 0.009, 8, 100]} />
          <meshStandardMaterial
            color={glow}
            emissive={glow}
            emissiveIntensity={1.8}
          />
        </mesh>
      ))}
      <gridHelper
        args={[14, 28, "#143245", "#0c1c2a"]}
        position={[0, -0.04, 0]}
      />
    </group>
  );
}
function FrameProbe({ onStats }: { onStats: (stats: FrameStats) => void }) {
  const samples = useRef<number[]>([]);
  useFrame((_, delta) => {
    if (samples.current.length >= 90) return;
    samples.current.push(delta * 1000);
    if (samples.current.length === 90) {
      const sorted = samples.current.slice(15).sort((a, b) => a - b);
      onStats({
        frames: sorted.length,
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
      });
    }
  });
  return null;
}
export default function AvatarStage({
  source,
  engine,
  command,
  onStats,
}: {
  source: AssetSource;
  engine: AvatarEngine;
  command: CameraCommand;
  onStats: (stats: FrameStats) => void;
}) {
  const [asset, setAsset] = useState<{
    key: string;
    gltf?: GLTF;
    error?: string;
  }>({ key: "" });
  const [contextLost, setContextLost] = useState(false);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useEffect(() => {
    let active = true;
    let loaded: GLTF | undefined;
    const abort = new AbortController();
    async function load() {
      try {
        const data =
          source.data ??
          (await fetch(source.url!, { signal: abort.signal }).then((r) => {
            if (!r.ok) throw new Error(`GLB HTTP ${r.status}`);
            return r.arrayBuffer();
          }));
        if (!data) throw new Error("Nessun dato GLB disponibile.");
        inspectGlb(data);
        loaded = await new GLTFLoader().parseAsync(data, "");
        validateScene(loaded);
        if (active) setAsset({ key: source.key, gltf: loaded });
        else disposeScene(loaded.scene);
      } catch (error) {
        if (loaded) {
          disposeScene(loaded.scene);
          loaded = undefined;
        }
        if (active)
          setAsset({
            key: source.key,
            error:
              error instanceof Error
                ? error.message
                : "Caricamento GLB fallito.",
          });
      }
    }
    void load();
    return () => {
      active = false;
      abort.abort();
      if (loaded) disposeScene(loaded.scene);
    };
  }, [source]);
  const current = asset.key === source.key ? asset : undefined;
  return (
    <div
      className="canvas-wrap"
      data-testid="stage"
      data-asset-status={
        current?.gltf ? "ready" : current?.error ? "error" : "loading"
      }
    >
      <StageBoundary>
        <Canvas
          camera={{ position: [3.5, 2.35, 6.6], fov: 34, near: 0.1, far: 50 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            canvas.setAttribute(
              "aria-label",
              "Visualizzatore 3D interattivo. Usa i controlli telecamera per ruotare e ingrandire.",
            );
            canvas.addEventListener(
              "webglcontextlost",
              () => setContextLost(true),
              { once: true },
            );
          }}
        >
          <fog attach="fog" args={["#050b14", 10, 23]} />
          <ambientLight intensity={0.65} color="#9bb4c8" />
          <spotLight
            position={[3, 7, 4]}
            intensity={85}
            angle={0.55}
            penumbra={1}
            color="#c6ecff"
          />
          <pointLight position={[-3, 3, -2]} intensity={30} color="#6ad9ff" />
          <pointLight position={[3, 1, -3]} intensity={25} color="#a59bff" />
          <Platform state={snapshot.state} />
          {current?.gltf && (
            <Rig key={source.key} gltf={current.gltf} engine={engine} />
          )}
          <CameraRig command={command} reduced={snapshot.reducedMotion} />
          <FrameProbe onStats={onStats} />
        </Canvas>
      </StageBoundary>
      {(!current || current.error || contextLost) && (
        <div
          className="stage-failure"
          role={current?.error || contextLost ? "alert" : "status"}
        >
          {contextLost
            ? "Contesto WebGL perso. Ricarica la pagina per ripristinare lo stage."
            : (current?.error ?? "Caricamento geometria 3D…")}
        </div>
      )}
      {current?.gltf && (
        <span className="rig-report" data-testid="rig-report">
          GLB 2.0 · {rigReport(current.gltf)}
        </span>
      )}
    </div>
  );
}
