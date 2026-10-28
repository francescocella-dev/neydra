import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import type { DesktopStatus } from '../shared/contracts';
import { ChatPanel } from './ChatPanel';
import { SettingsPanel } from './SettingsPanel';
import { connectionLabel, initialChatView } from './chat-view';
import { demoReducer, initialState } from './model';

export function App() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [bridgeError, setBridgeError] = useState(false);
  const [chatView, setChatView] = useState(initialChatView);
  const [chatOpen, setChatOpen] = useState(true);
  const [telemetryOpen, setTelemetryOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
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
    const offWindow = window.neydra.onWindowState(value => { if (mounted) setFullscreen(value.fullscreen); });
    void window.neydra.getWindowState().then(result => {
      if (mounted && result.ok) setFullscreen(result.state.fullscreen);
    }).catch(() => { if (mounted) setWindowNotice('Stato finestra non disponibile.'); });
    return () => { mounted = false; off(); offWindow(); };
  }, []);

  async function toggleFullscreen() {
    try {
      const result = await window.neydra.setFullscreen({ enabled: !fullscreen });
      if (!result.ok) { setWindowNotice('Schermo intero non disponibile su questa configurazione.'); return; }
      setFullscreen(result.state.fullscreen);
      setWindowNotice('');
    } catch { setWindowNotice('Schermo intero non disponibile su questa configurazione.'); }
  }

  function showAccount() {
    setSettingsOpen(false);
    setChatOpen(true);
    requestAnimationFrame(() => {
      const account = document.getElementById('chat-account') as HTMLDetailsElement | null;
      if (account) { account.open = true; account.querySelector('summary')?.focus(); account.scrollIntoView({ block: 'nearest' }); }
    });
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


  const { connection, selectedModel } = chatView;
  const selectedName = connection.models.find(model => model.slug === selectedModel)?.name;
  const layout = ['mini-layout', !chatOpen ? 'chat-collapsed' : '', !telemetryOpen ? 'telemetry-collapsed' : ''].filter(Boolean).join(' ');

  return <div className={`mini-shell${reducedMotion ? ' motion-paused' : ''}`}>
    <div className="energy-field" aria-hidden="true">
      <svg className="energy-lines" viewBox="0 0 1440 1000" preserveAspectRatio="none">
        <path className="energy-base" d="M-100 860 C130 700 170 930 390 660 S690 480 820 260 S1190 180 1510 -40" />
        <path className="energy energy-one" d="M-100 860 C130 700 170 930 390 660 S690 480 820 260 S1190 180 1510 -40" />
        <path className="energy-base" d="M-80 260 C180 110 300 360 500 490 S800 650 1030 800 S1330 820 1510 1060" />
        <path className="energy energy-two" d="M-80 260 C180 110 300 360 500 490 S800 650 1030 800 S1330 820 1510 1060" />
        <path className="energy energy-three" d="M120 -80 C290 120 160 330 300 510 S600 800 490 1080" />
      </svg>
    </div>
    <header className="mini-topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">N</span><div><span className="brand-name">NEYDRA</span><span className="brand-caption">Il tuo spazio, con Mini</span></div></div>
      <nav className="topbar-actions" aria-label="Comandi interfaccia">
        <button type="button" aria-pressed={chatOpen} aria-controls="conversation-panel" onClick={() => setChatOpen(value => !value)}>{chatOpen ? 'Nascondi chat' : 'Apri chat'}</button>
        <button type="button" aria-pressed={telemetryOpen} aria-controls="status-panel" onClick={() => setTelemetryOpen(value => !value)}>{telemetryOpen ? 'Nascondi stato' : 'Mostra stato'}</button>
        <button type="button" className={fullscreen ? 'fullscreen-exit' : ''} onClick={() => { void toggleFullscreen(); }}>{fullscreen ? 'Esci da schermo intero' : 'Schermo intero'} <kbd>F11</kbd></button>
        <button type="button" aria-expanded={settingsOpen} aria-controls="mini-settings" onClick={() => setSettingsOpen(true)}>Impostazioni <span aria-hidden="true">⚙</span></button>
      </nav>
    </header>
    {windowNotice && <p className="window-notice" role="alert">{windowNotice}</p>}
    <main className={layout}>
      <section className="avatar-zone" aria-label="Area riservata a Neydra Mini">
        <div className="stage-heading"><div><span className="eyebrow">NEYDRA</span><h1>Mini<span className="orange-point">.</span></h1></div><span className="stage-tag">Spazio personale</span></div>
        <div className="stage-light" aria-hidden="true" />
        <div className="stage-guide guide-top" aria-hidden="true"/><div className="stage-guide guide-bottom" aria-hidden="true"/>
        <div className="avatar-caption"><span className="stage-indicator" aria-hidden="true"/><p>Uno spazio per Mini.<span>Il modello 3D definitivo sarà collegato qui.</span></p></div>
      </section>
      <section id="conversation-panel" className="conversation-zone" aria-label="Conversazione ChatGPT" hidden={!chatOpen}>
        <header className="panel-heading"><div><span className="eyebrow">Il filo del dialogo</span><h2>Conversazione</h2></div><button type="button" className="quiet-button" aria-label="Chiudi chat" onClick={() => setChatOpen(false)}>Chiudi <span aria-hidden="true">×</span></button></header>
        <ChatPanel onViewState={setChatView} />
      </section>
      <aside id="status-panel" className="telemetry-zone" aria-label="Stato e utilizzo" hidden={!telemetryOpen}>
        <header className="panel-heading"><div><span className="eyebrow">Qui e adesso</span><h2>Stato e utilizzo</h2></div><button type="button" className="quiet-button" aria-label="Chiudi pannello stato" onClick={() => setTelemetryOpen(false)}>×</button></header>
        <div className="status-cards">
          <section className="metric-card connection-card"><span className="metric-label">ChatGPT · ultimo stato noto</span><strong className={connection.state === 'connected' ? 'metric-connected' : ''}><i className="state-dot"/>{connectionLabel[connection.state]}</strong><p>{connection.state === 'connected' ? 'Connessione del piano autorizzata.' : 'Collega il tuo account dalle impostazioni.'}</p><button type="button" className="text-button" onClick={showAccount}>Gestisci connessione <span aria-hidden="true">↗</span></button></section>
          <section className="metric-card"><span className="metric-label">Modello selezionato</span><strong>{selectedName || 'Da scegliere'}</strong><p>{selectedModel || (connection.state === 'connected' ? `${connection.models.length} modelli nel catalogo autorizzato` : 'Il catalogo sarà disponibile dopo l’accesso.')}</p></section>
          <section className="metric-card"><span className="metric-label">Sessione e contesto</span><strong>{chatView.running ? 'Risposta in corso' : chatView.hasConversation ? 'Conversazione in memoria' : 'Pronto per una conversazione'}</strong><p>I turni completati restano nella sessione. Nessun archivio permanente.</p></section>
          <section className="metric-card usage-card"><span className="metric-label">Utilizzo del piano</span><strong>Quota non disponibile</strong><p>Verifica limiti, crediti e ricarica nell’account ChatGPT prima di ogni invio. Nessuna stima locale.</p></section>
        </div>
      </aside>
    </main>
    <SettingsPanel open={settingsOpen} onDismiss={() => setSettingsOpen(false)} onAccount={showAccount} fullscreen={fullscreen} onFullscreen={() => { void toggleFullscreen(); }} reducedMotion={reducedMotion} onReducedMotion={setReducedMotion}>
      <details className="developer-tools"><summary>Banco di prova offline</summary>
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
    </SettingsPanel>
    <footer className="mini-footer"><span><i className="footer-dot"/> Mini · anteprima dell’interfaccia</span><span>Voce e modello 3D non ancora integrati</span></footer>
  </div>;
}
