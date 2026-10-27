import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AvatarEngine } from "./engine/AvatarEngine";
import { AVATAR_STATES } from "./engine/protocol";
import type { AvatarId, AvatarState, Expression } from "./engine/protocol";
import { DEMO_CAPTION, DEMO_CUES, DEMO_DURATION } from "./engine/demo";
import AvatarStage from "./stage/AvatarStage";
import type {
  AssetSource,
  CameraCommand,
  FrameStats,
} from "./stage/AvatarStage";
import { inspectGlb } from "./stage/assets";
const LABELS: Record<AvatarState, string> = {
  idle: "In attesa",
  listening: "In ascolto",
  processing: "Elaborazione",
  speaking: "Parlato",
  interrupted: "Interrotto",
  error: "Errore",
};
const EXPRESSIONS: [Expression, string][] = [
  ["neutral", "Neutra"],
  ["warm", "Cordiale"],
  ["focused", "Concentrata"],
  ["concerned", "Preoccupata"],
];
function Mark() {
  return (
    <svg viewBox="0 0 36 40" fill="none" aria-hidden="true">
      <path
        d="M18 2 33 11v18L18 38 3 29V11L18 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="m3 11 15 9 15-9M18 20v18M10 28V13l16 15V13"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
export default function App() {
  const [engine] = useState(() => new AvatarEngine());
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [avatar, setAvatar] = useState<AvatarId>("holo");
  const [custom, setCustom] = useState<AssetSource | null>(null);
  const [importError, setImportError] = useState("");
  const [importName, setImportName] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [command, setCommand] = useState<CameraCommand>({
    serial: 0,
    action: "reset",
  });
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [trace, setTrace] = useState<string[]>([]);
  const sequence = useRef(0);
  const importSequence = useRef(0);
  const source = useMemo<AssetSource>(
    () =>
      custom ?? {
        key: avatar,
        url: `${import.meta.env.BASE_URL}models/${avatar}-prototype.glb`,
      },
    [avatar, custom],
  );
  const log = useCallback(
    (entry: string) => setTrace((list) => [entry, ...list].slice(0, 5)),
    [],
  );
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      engine.dispatch({ type: "reducedMotionChanged", enabled: query.matches });
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [engine]);
  const cancel = useCallback(() => {
    const speech = engine.getSnapshot().speech;
    if (speech) {
      engine.dispatch({ type: "speechCancelled", speechId: speech.id });
      log("speechCancelled → interrupted");
    } else {
      engine.dispatch({ type: "stateChanged", state: "interrupted" });
      log("stateChanged → interrupted");
    }
  }, [engine, log]);
  useEffect(() => {
    const stop = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
  }, [cancel]);
  const speechId = snapshot.speech?.id;
  useEffect(() => {
    if (!speechId) return;
    const tick = () => {
      const speech = engine.getSnapshot().speech;
      if (speech?.id !== speechId) return;
      const time = performance.now() - speech.startedAt;
      setElapsed(time);
      if (time >= DEMO_DURATION) {
        engine.dispatch({ type: "speechEnded", speechId });
        log("speechEnded → idle");
      }
    };
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [engine, speechId, log]);
  function changeState(state: AvatarState) {
    engine.dispatch({ type: "stateChanged", state });
    log(`stateChanged → ${state}`);
  }
  function camera(action: CameraCommand["action"]) {
    setCommand((c) => ({ serial: c.serial + 1, action }));
  }
  function runDemo() {
    const speechId = `preview-${++sequence.current}`;
    setElapsed(0);
    engine.dispatch({
      type: "speechStarted",
      speechId,
      startedAt: performance.now(),
    });
    DEMO_CUES.forEach((cue) =>
      engine.dispatch({ type: "viseme", speechId, cue }),
    );
    log(`speechStarted · ${DEMO_CUES.length} visemi simulati`);
  }
  async function importGlb(file?: File) {
    if (!file) return;
    const token = ++importSequence.current;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Limite GLB: 20 MiB.");
      const data = await file.arrayBuffer();
      inspectGlb(data);
      if (token !== importSequence.current) return;
      setCustom({ key: `local-${token}`, data });
      setImportName(file.name);
      setImportError("");
      log("GLB locale caricato · nessun upload");
    } catch (error) {
      if (token === importSequence.current)
        setImportError(
          error instanceof Error ? error.message : "Importazione fallita.",
        );
    }
  }
  return (
    <div className={`app ${sidebar ? "" : "sidebar-collapsed"}`}>
      <a className="skip-link" href="#controls">
        Vai ai controlli
      </a>
      <header className="topbar">
        <a className="brand" href="#">
          <Mark />
          <span>
            NEYDRA<small>AVATAR LABORATORY</small>
          </span>
        </a>
        <div className="top-note">
          <span className="status-dot" /> Ambiente locale{" "}
          <span className="divider">/</span> Prototipo tecnico
        </div>
        <span className="version">
          P0B <span>·</span> 0.1
        </span>
      </header>
      <aside className="sidebar" aria-label="Sessione di laboratorio">
        <button
          className="sidebar-toggle"
          aria-expanded={sidebar}
          aria-label={
            sidebar ? "Comprimi pannello sessione" : "Espandi pannello sessione"
          }
          onClick={() => setSidebar(!sidebar)}
        >
          {sidebar ? "←" : "→"}
        </button>
        {sidebar && (
          <>
            <p className="eyebrow">SPAZIO DI LAVORO</p>
            <div className="session">
              <span className="session-icon">◇</span>
              <div>
                Avatar stage<small>Sessione di prova locale</small>
              </div>
              <span className="small-dot" />
            </div>
            <div className="sidebar-section">
              <p className="eyebrow">QUESTO ESPERIMENTO</p>
              <p>
                Due presenze.
                <br />
                Un unico motore.
              </p>
              <span className="muted">
                Esplora geometria, espressioni e transizioni nello spazio 3D.
              </span>
            </div>
            <div className="event-log">
              <p className="eyebrow">EVENTI DELLA SESSIONE</p>
              {trace.length ? (
                <ol>
                  {trace.map((line, i) => (
                    <li key={`${line}-${i}`}>{line}</li>
                  ))}
                </ol>
              ) : (
                <p className="muted">
                  Gli eventi appariranno qui quando usi i controlli.
                </p>
              )}
            </div>
            <div className="local-note">
              <span>◉</span>
              <div>
                Microfono disattivato<small>Nessun audio acquisito</small>
              </div>
            </div>
          </>
        )}
      </aside>
      <main className="main-stage" aria-label="Laboratorio avatar 3D">
        <div className="stage-heading">
          <div>
            <p className="eyebrow">01 / PRESENZA DIGITALE</p>
            <h1>
              {custom ? "GLB locale" : avatar === "holo" ? "Holo" : "Mini"}
              <span>
                {custom
                  ? "Asset importato"
                  : avatar === "holo"
                    ? "Volto olografico"
                    : "Compagno robotico"}
              </span>
            </h1>
          </div>
          <span className="dimension-tag">3D / INTERACTIVE</span>
        </div>
        <AvatarStage
          source={source}
          engine={engine}
          command={command}
          onStats={setStats}
        />
        <div className="prototype-label">
          ENGINE PROTOTYPE / NOT FINAL CHARACTER
          <small>
            {custom
              ? "Asset locale di prova · qualità e diritti da verificare"
              : "Geometrie tecniche originali · personaggi definitivi da realizzare"}
          </small>
        </div>
        <div className="camera-tools" aria-label="Controlli telecamera">
          <span>TELECAMERA</span>
          <button aria-label="Ruota a sinistra" onClick={() => camera("left")}>
            ↶
          </button>
          <button aria-label="Ruota a destra" onClick={() => camera("right")}>
            ↷
          </button>
          <i />
          <button aria-label="Ingrandisci" onClick={() => camera("in")}>
            ＋
          </button>
          <button aria-label="Riduci zoom" onClick={() => camera("out")}>
            −
          </button>
          <i />
          <button onClick={() => camera("face")}>Volto</button>
          <button onClick={() => camera("reset")}>Reset</button>
        </div>
        <section className="caption-panel" aria-label="Anteprima parlato">
          <div className="caption-meta">
            <span
              className={`state-badge state-${snapshot.state}`}
              data-testid="current-state"
            >
              <span className="status-dot" />
              {LABELS[snapshot.state]}
            </span>
            <span>ANTEPRIMA SENZA AUDIO · TIMING SIMULATI</span>
          </div>
          <p aria-live="polite">
            {speechId
              ? DEMO_CAPTION
              : snapshot.state === "interrupted"
                ? "Anteprima interrotta. Pronto a ricominciare."
                : "Una presenza prende forma."}
          </p>
          <div className="caption-actions">
            <span className="caption-help">
              {speechId
                ? `${Math.min(elapsed / 1000, 4.8).toFixed(1)} / 4.8 s · visemi sintetici`
                : "Trascina per orbitare · scorri per lo zoom"}
            </span>
            <button className="primary" onClick={runDemo}>
              <span>▷</span> {speechId ? "Riavvia sequenza" : "Simula parlato"}
            </button>
            <button
              className="stop"
              onClick={cancel}
              aria-label="Interrompi anteprima"
            >
              □ <span>Stop</span>
              <kbd>Esc</kbd>
            </button>
          </div>
          <progress
            aria-label="Avanzamento simulazione"
            max={DEMO_DURATION}
            value={speechId ? Math.min(elapsed, DEMO_DURATION) : 0}
          />
        </section>
      </main>
      <aside className="controls" id="controls" aria-label="Controlli avatar">
        <p className="eyebrow">CONFIGURAZIONE STAGE</p>
        <section>
          <h2>La tua presenza</h2>
          <div className="avatar-options">
            {(["holo", "mini"] as const).map((id) => (
              <button
                key={id}
                aria-pressed={!custom && avatar === id}
                onClick={() => {
                  ++importSequence.current;
                  setAvatar(id);
                  setCustom(null);
                  setImportError("");
                  log(`avatarChanged → ${id} · stato preservato`);
                }}
              >
                <span className="avatar-symbol">
                  {id === "holo" ? "◈" : "▣"}
                </span>
                <strong>{id === "holo" ? "Holo" : "Mini"}</strong>
                <small>{id === "holo" ? "Olografico" : "Robotico"}</small>
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="section-heading">
            <h2>Stato animazione</h2>
            <span>6 STATI</span>
          </div>
          <div className="state-grid">
            {AVATAR_STATES.map((state, i) => (
              <button
                key={state}
                aria-pressed={snapshot.state === state}
                onClick={() => changeState(state)}
              >
                <span>0{i + 1}</span>
                {LABELS[state]}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h2>Espressione</h2>
          <select
            aria-label="Espressione"
            value={snapshot.expression}
            onChange={(e) =>
              engine.dispatch({
                type: "expressionChanged",
                expression: e.target.value as Expression,
                weight: snapshot.expressionWeight,
              })
            }
          >
            {EXPRESSIONS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <label className="range-label" htmlFor="expression-weight">
            Intensità{" "}
            <span>{Math.round(snapshot.expressionWeight * 100)}%</span>
          </label>
          <input
            id="expression-weight"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={snapshot.expressionWeight}
            onChange={(e) =>
              engine.dispatch({
                type: "expressionChanged",
                expression: snapshot.expression,
                weight: Number(e.target.value),
              })
            }
          />
          <label className="range-label" htmlFor="head-yaw">
            Rotazione testa{" "}
            <span>{Math.round((snapshot.head.yaw * 180) / Math.PI)}°</span>
          </label>
          <input
            id="head-yaw"
            type="range"
            min="-0.6"
            max="0.6"
            step="0.01"
            value={snapshot.head.yaw}
            onChange={(e) =>
              engine.dispatch({
                type: "headPoseChanged",
                yaw: Number(e.target.value),
                pitch: snapshot.head.pitch,
              })
            }
          />
          <label className="range-label" htmlFor="head-pitch">
            Inclinazione testa{" "}
            <span>{Math.round((snapshot.head.pitch * 180) / Math.PI)}°</span>
          </label>
          <input
            id="head-pitch"
            type="range"
            min="-0.35"
            max="0.35"
            step="0.01"
            value={snapshot.head.pitch}
            onChange={(e) =>
              engine.dispatch({
                type: "headPoseChanged",
                yaw: snapshot.head.yaw,
                pitch: Number(e.target.value),
              })
            }
          />
          <label className="check">
            <input
              type="checkbox"
              checked={snapshot.reducedMotion}
              onChange={(e) =>
                engine.dispatch({
                  type: "reducedMotionChanged",
                  enabled: e.target.checked,
                })
              }
            />
            Movimento ridotto
          </label>
        </section>
        <section className="import-section">
          <h2>Asset 3D</h2>
          <label className="file-button">
            ＋ Importa GLB locale
            <input
              aria-label="Importa GLB locale"
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(e) => {
                void importGlb(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="muted">
            {custom ? importName : "Fixture originali · MIT"}
            <br />
            Solo file autosufficienti, max 20 MiB. Usa asset di cui possiedi i
            diritti.
          </p>
          {importError && (
            <p role="alert" className="error-text">
              {importError}
            </p>
          )}
        </section>
        <div className="asset-gate">
          <span>◇</span>
          <p>
            BLOCKED ON 3D ASSET<small>Artwork e lip-sync di produzione</small>
          </p>
        </div>
        <details className="diagnostics">
          <summary>Diagnostica rendering</summary>
          {stats ? (
            <p>
              {stats.frames} frame dopo riscaldamento
              <br />
              Mediana {stats.median.toFixed(1)} ms · p95 {stats.p95.toFixed(1)}{" "}
              ms
              <br />
              Misura di questa sessione browser.
            </p>
          ) : (
            <p>Campionamento dei primi 90 frame…</p>
          )}
        </details>
        <p className="offline-note">
          Laboratorio offline
          <br />
          <span>ChatGPT / Codex non collegati</span>
        </p>
      </aside>
      <footer className="footer">
        <span>
          NEYDRA <span className="muted">/</span> RICERCA SULLA PRESENZA 3D
        </span>
        <span>
          Render WebGL reale <span>·</span> Nessun servizio esterno
        </span>
      </footer>
    </div>
  );
}
