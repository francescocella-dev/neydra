import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import type { AvatarId, DesktopStatus } from '../shared/contracts';
import { demoReducer, initialState } from './model';

export function App() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [bridgeError, setBridgeError] = useState(false);
  const [prompt, setPrompt] = useState('Prova dello streaming locale');
  const [avatar, setAvatar] = useState<AvatarId>('holo');
  const [demo, dispatch] = useReducer(demoReducer, initialState);
  const activeId = useRef<string | null>(null);
  const startLock = useRef(false);

  useEffect(() => {
    let mounted = true;
    const off = window.neydra.onEvent(event => {
      if (event.type === 'responseCompleted' || event.type === 'responseCancelled' || event.type === 'responseFailed') {
        if (activeId.current === event.requestId) { activeId.current = null; startLock.current = false; }
      }
      dispatch(event);
    });
    void window.neydra.getStatus().then(value => { if (mounted) setStatus(value); })
      .catch(() => { if (mounted) setBridgeError(true); });
    return () => { mounted = false; off(); };
  }, []);

  async function stop() {
    const requestId = activeId.current;
    if (!requestId) return;
    try {
      const result = await window.neydra.cancel({ requestId });
      if (result.ok) return;
    } catch { /* Sanitized UI error below. */ }
    if (activeId.current === requestId) { activeId.current = null; startLock.current = false; }
    dispatch({ type: 'rejected', requestId });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeId.current) {
        void window.neydra.cancel({ requestId: activeId.current }).catch(() => setBridgeError(true));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (startLock.current || !prompt.trim() || !status) return;
    startLock.current = true;
    const requestId = crypto.randomUUID();
    activeId.current = requestId;
    dispatch({ type: 'begin', requestId });
    try {
      const result = await window.neydra.startOfflineDemo({ requestId, prompt });
      if (result.ok) return;
    } catch { /* Only a fixed message is shown; no raw IPC error. */ }
    if (activeId.current === requestId) { activeId.current = null; startLock.current = false; }
    dispatch({ type: 'rejected', requestId });
  }

  return <div className="shell">
    <header><div><span className="eyebrow">DESKTOP WINDOWS · PRE-ALPHA</span><h1>NEYDRA</h1></div><span className="badge">OFFLINE · scheletro tecnico</span></header>
    <main>
      <aside aria-label="Stato integrazioni">
        <h2>Connessioni</h2>
        <dl>
          <dt>ChatGPT Plus</dt><dd>Non integrato · PR #6</dd>
          <dt>Motore 3D</dt><dd>Non integrato · PR #7</dd>
          <dt>Voce locale</dt><dd>Non integrata</dd>
          <dt>Microfono</dt><dd>Disattivato · nessun accesso</dd>
        </dl>
        <p>Nessuna connessione di rete, credenziale o conversazione salvata.</p>
      </aside>
      <section className="workspace" aria-label="Area tecnica">
        <div className="stage">
          <span className="eyebrow">SPAZIO RISERVATO AL MOTORE 3D</span>
          <h2>Il palco è da collegare.</h2>
          <p>Qui verrà montato il renderer Three.js della PR #7.<br />Nessun avatar è caricato in questa struttura.</p>
          <label>Preferenza avatar futura
            <select value={avatar} onChange={event => setAvatar(event.target.value as AvatarId)}>
              <option value="holo">Holo</option><option value="mini">Mini</option>
            </select>
          </label>
          <p className="muted">Scelta locale in memoria. Non avvia un avatar.</p>
        </div>
        <section className="demo" aria-labelledby="demo-title">
          <h2 id="demo-title">Banco di prova offline</h2>
          <p>Il testo predefinito prova streaming IPC e annullamento. L’input resta locale e non viene elaborato da un modello.</p>
          <p role="status">{bridgeError ? 'Bridge desktop non disponibile' : status ? demo.outcome : 'Verifica bridge desktop…'}</p>
          <div className="caption" aria-label="Testo demo">{demo.text || 'Il testo della demo comparirà qui.'}</div>
          <form onSubmit={event => { void start(event); }}>
            <label htmlFor="prompt">Input di prova (massimo 2000 caratteri)</label>
            <textarea id="prompt" value={prompt} maxLength={2000} onChange={event => setPrompt(event.target.value)} rows={2} />
            <div className="actions"><button type="submit" disabled={!status || bridgeError || demo.running || !prompt.trim()}>Avvia demo offline</button>
              <button type="button" onClick={() => { void stop(); }} disabled={!demo.running}>Stop / Esc</button>
              <span className="muted">Stato conversazione: {demo.state}</span>
            </div>
          </form>
        </section>
      </section>
    </main>
    <footer>Protocollo IPC v1 · Autenticazione, inferenza, 3D e audio reali non attivi.</footer>
  </div>;
}
