import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import type { Connection, DesktopStatus } from '../shared/contracts';
import { ChatPanel } from './ChatPanel';
import { demoReducer, initialState } from './model';

const disconnected: Connection = { state: 'disconnected', models: [] };

export function App() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [bridgeError, setBridgeError] = useState(false);
  const [connection, setConnection] = useState<Connection>(disconnected);
  const [chatOpen, setChatOpen] = useState(true);
  const [telemetryOpen, setTelemetryOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [windowNotice, setWindowNotice] = useState('');
  const [prompt, setPrompt] = useState('Prova dello streaming locale');
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
    const refreshConnection = () => {
      void window.neydra.getConnection().then(value => { if (mounted) setConnection(value); })
        .catch(() => { if (mounted) setBridgeError(true); });
    };
    refreshConnection();
    const timer = setInterval(refreshConnection, 4000);
    const onFullscreen = () => { if (mounted) setFullscreen(Boolean(document.fullscreenElement)); };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      mounted = false; off(); clearInterval(timer);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setWindowNotice('');
    } catch {
      setWindowNotice('Schermo intero non disponibile su questa configurazione.');
    }
  }

  function showAccount() {
    setSettingsOpen(false);
    setChatOpen(true);
    requestAnimationFrame(() => document.getElementById('chat-title')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  async function stop() {
    const requestId = activeId.current;
    if (!requestId) return;
    try {
      const result = await window.neydra.cancel({ requestId });
      if (result.ok) return;
    } catch { /* Generic UI error; never print raw IPC data. */ }
    if (activeId.current === requestId) { activeId.current = null; startLock.current = false; }
    dispatch({ type: 'rejected', requestId });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeId.current) {
        void window.neydra.cancel({ requestId: activeId.current }).catch(() => setBridgeError(true));
      }
      if (event.key === 'F11') {
        event.preventDefault();
        void toggleFullscreen();
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
    } catch { /* Only sanitized UI text. */ }
    if (activeId.current === requestId) { activeId.current = null; startLock.current = false; }
    dispatch({ type: 'rejected', requestId });
  }

  const layout = ['mini-layout', !chatOpen ? 'chat-collapsed' : '', !telemetryOpen ? 'telemetry-collapsed' : ''].filter(Boolean).join(' ');

  return <div className="mini-shell">
    <div className="energy-field" aria-hidden="true">
      <svg className="energy-lines" viewBox="0 0 1440 900" preserveAspectRatio="none">
        <path className="energy energy-one" d="M-70 710 C220 490 300 800 580 440 S1030 190 1520 30" />
        <path className="energy energy-two" d="M-90 845 C260 700 445 630 650 590 S1150 330 1530 480" />
        <path className="energy energy-three" d="M430 -70 C340 260 510 350 690 480 S980 650 1120 970" />
      </svg>
    </div>
    <header className="mini-topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">N</span>
        <div><div className="brand-name">NEYDRA</div><span className="brand-caption">MINI · DESKTOP COMPANION</span></div>
      </div>
      <div className="topbar-actions" aria-label="Comandi interfaccia">
        <button type="button" aria-pressed={chatOpen} onClick={() => setChatOpen(value => !value)}>{chatOpen ? 'Nascondi trascrizione' : 'Apri trascrizione'}</button>
        <button type="button" aria-pressed={telemetryOpen} onClick={() => setTelemetryOpen(value => !value)}>{telemetryOpen ? 'Nascondi stato' : 'Mostra stato'}</button>
        <button type="button" onClick={() => { void toggleFullscreen(); }}>{fullscreen ? 'Esci da schermo intero' : 'Schermo intero'}</button>
        <button type="button" aria-expanded={settingsOpen} aria-controls="mini-settings" onClick={() => setSettingsOpen(value => !value)}>Impostazioni</button>
      </div>
    </header>

    {windowNotice && <p className="window-notice" role="alert">{windowNotice}</p>}

    <main className={layout}>
      <section className="avatar-zone" aria-label="Area riservata a Neydra Mini">
        <div className="avatar-halo" aria-hidden="true"><span className="halo-center"/></div>
        <div className="avatar-caption">
          <span className="eyebrow">NEYDRA MINI</span>
          <h1>Una presenza.<br/>Sempre pronta.</h1>
          <p>Il modello 3D definitivo sarà collegato qui quando il lavoro su Mini sarà pronto.</p>
          <div className="avatar-state"><span className="state-dot"/> In attesa · avatar non integrato</div>
        </div>
      </section>

      <section className="conversation-zone" aria-label="Conversazione ChatGPT" hidden={!chatOpen}>
        <div className="panel-heading"><div><span className="eyebrow">CONVERSAZIONE</span><h2>Trascrizione e chat</h2></div>
          <button type="button" aria-label="Chiudi trascrizione" onClick={() => setChatOpen(false)}>Chiudi</button>
        </div>
        <div className="conversation-scroll"><ChatPanel /></div>
      </section>

      <aside className="telemetry-zone" aria-label="Stato NEYDRA" hidden={!telemetryOpen}>
        <div className="panel-heading"><div><span className="eyebrow">PANORAMICA</span><h2>Stato NEYDRA</h2></div>
          <button type="button" aria-label="Chiudi pannello stato" onClick={() => setTelemetryOpen(false)}>Chiudi</button>
        </div>
        <div className="metric-card"><span>Connessione ChatGPT</span>
          <strong className={connection.state === 'connected' ? 'metric-connected' : ''}>{connection.state}</strong></div>
        <div className="metric-card"><span>Modelli disponibili</span><strong>{connection.models.length}</strong>
          <small>Selezionabili nella conversazione dopo il collegamento.</small></div>
        <div className="metric-card"><span>Contesto</span><strong>Solo sessione corrente</strong>
          <small>Nessuna memoria permanente implementata.</small></div>
        <div className="metric-card"><span>Consumo e quota settimanale</span><strong>Dato non disponibile</strong>
          <small>NEYDRA non riceve i contatori ufficiali del piano. Non vengono stimate percentuali.</small></div>
        <div className="metric-card"><span>Voce</span><strong>In preparazione</strong>
          <small>Il microfono non viene aperto e non viene acquisito audio.</small></div>
      </aside>
    </main>

    {settingsOpen && <div className="settings-backdrop" onClick={() => setSettingsOpen(false)}>
      <section id="mini-settings" className="settings-drawer" aria-label="Impostazioni NEYDRA" onClick={event => event.stopPropagation()}>
        <div className="panel-heading"><div><span className="eyebrow">PREFERENZE</span><h2>Impostazioni</h2></div>
          <button type="button" onClick={() => setSettingsOpen(false)}>Chiudi</button>
        </div>
        <div className="settings-group"><h3>Tema attivo</h3><p>NEYDRA Mini · grafite e arancio. Il tema Holo sarà sviluppato in una fase separata.</p></div>
        <div className="settings-group"><h3>ChatGPT e modelli</h3><p>Accesso, disconnessione e selezione del modello sono già operativi nella sezione conversazione.</p>
          <button type="button" onClick={showAccount}>Apri accesso ChatGPT</button></div>
        <div className="settings-group"><h3>Voce e ascolto</h3><p>Modalità ibrida approvata; implementazione audio non ancora collegata. Microfono disattivato.</p></div>
        <div className="settings-group"><h3>Finestra</h3>
          <button type="button" onClick={() => { void toggleFullscreen(); }}>{fullscreen ? 'Esci da schermo intero' : 'Attiva schermo intero'}</button></div>
        <details className="developer-tools">
          <summary>Strumenti tecnici · demo offline</summary>
          <section className="demo" aria-labelledby="demo-title">
            <h3 id="demo-title">Banco di prova offline</h3>
            <p>Il testo è predefinito, resta locale e non viene inviato a ChatGPT.</p>
            <p role="status">{bridgeError ? 'Bridge desktop non disponibile' : status ? demo.outcome : 'Verifica bridge desktop…'}</p>
            <div className="caption" aria-label="Testo demo">{demo.text || 'Il testo della demo comparirà qui.'}</div>
            <form onSubmit={event => { void start(event); }}>
              <label htmlFor="prompt">Input di prova (massimo 2000 caratteri)</label>
              <textarea id="prompt" value={prompt} maxLength={2000} onChange={event => setPrompt(event.target.value)} rows={2} />
              <div className="actions"><button type="submit" disabled={!status || bridgeError || demo.running || !prompt.trim()}>Avvia demo offline</button>
                <button type="button" onClick={() => { void stop(); }} disabled={!demo.running}>Stop / Esc</button>
                <span className="muted">Stato: {demo.state}</span>
              </div>
            </form>
          </section>
        </details>
      </section>
    </div>}

    <footer className="mini-footer"><span>NEYDRA MINI · prima interfaccia</span><span>ChatGPT solo su consenso · Voce e 3D non ancora integrati</span></footer>
  </div>;
}
