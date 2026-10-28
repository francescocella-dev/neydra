import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import type { DesktopStatus } from '../shared/contracts';
import { ChatPanel } from './ChatPanel';
import { IconButton } from './Icon';
import { SettingsPanel, type MenuSection } from './SettingsPanel';
import { connectionLabel, initialChatView } from './chat-view';
import { demoReducer, initialState } from './model';

export function App() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [bridgeError, setBridgeError] = useState(false);
  const [chatView, setChatView] = useState(initialChatView);
  const [chatOpen, setChatOpen] = useState(true);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuSection, setMenuSection] = useState<MenuSection>('controls');
  const [accountTarget, setAccountTarget] = useState<HTMLDivElement | null>(null);
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

  function openMenu(section: MenuSection = 'controls') {
    setMenuSection(section);
    setSettingsOpen(true);
  }
  function closeChat() {
    setChatOpen(false);
    requestAnimationFrame(() => document.getElementById('control-menu-button')?.focus());
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
      <div className="brand"><h1>NEYDRA</h1><span>MINI</span></div>
      <div className="window-controls" aria-label="Comandi finestra">
        <button type="button" className={`connection-indicator status-${connection.state}`} aria-label={`ChatGPT: ${connectionLabel[connection.state]}`} title="ChatGPT e modelli" onClick={() => openMenu('account')}><i className="state-dot" aria-hidden="true"/><span>{connectionLabel[connection.state]}</span></button>
        <IconButton icon={fullscreen ? 'collapse' : 'expand'} label={fullscreen ? 'Esci da schermo intero' : 'Schermo intero'} hint={fullscreen ? 'Esci da schermo intero · F11' : 'Schermo intero · F11'} className={fullscreen ? 'fullscreen-exit' : ''} onClick={() => { void toggleFullscreen(); }} />
        <IconButton id="control-menu-button" icon="menu" label="Apri menu" aria-expanded={settingsOpen} aria-controls="mini-settings" onClick={() => openMenu()} />
      </div>
    </header>
    {windowNotice && <p className="window-notice" role="alert">{windowNotice}</p>}
    <main className={layout}>
      <section className="avatar-zone" aria-label="Area riservata a Neydra Mini">
        <div className="stage-light" aria-hidden="true"/><div className="stage-guide guide-top" aria-hidden="true"/><div className="stage-guide guide-bottom" aria-hidden="true"/>
        <span className="stage-note">Modello 3D non collegato</span>
      </section>
      <section id="conversation-panel" className="conversation-zone" aria-label="Conversazione ChatGPT" hidden={!chatOpen}>
        <header className="conversation-toolbar"><h2 className="sr-only">Conversazione</h2><IconButton icon="info" label="ChatGPT, modello e dettagli" onClick={() => openMenu('account')} /><IconButton icon="close" label="Chiudi chat" onClick={closeChat} /></header>
        <ChatPanel onViewState={setChatView} accountTarget={accountTarget} onOpenControls={() => openMenu('account')} visible={chatOpen} />
      </section>
      <aside id="status-panel" className="telemetry-zone" aria-label="Stato e utilizzo" hidden={!telemetryOpen}>
        <header className="status-heading"><h2>Stato</h2><IconButton icon="close" label="Chiudi pannello stato" onClick={() => setTelemetryOpen(false)} /></header>
        <div className="status-details" tabIndex={0}><dl>
          <div><dt>ChatGPT · ultimo stato noto</dt><dd>{connectionLabel[connection.state]}</dd></div>
          <div><dt>Modello</dt><dd>{selectedName || 'Da scegliere'}</dd></div>
          <div><dt>Sessione</dt><dd>{chatView.running ? 'Risposta in corso' : chatView.hasConversation ? 'Conversazione in memoria' : 'In memoria'}</dd></div>
          <div><dt>Quota</dt><dd>Non disponibile</dd></div>
        </dl></div>
      </aside>
    </main>
    <SettingsPanel open={settingsOpen} onDismiss={() => setSettingsOpen(false)} section={menuSection} onSection={setMenuSection} accountRef={setAccountTarget} chatOpen={chatOpen} onChat={() => setChatOpen(value => !value)} statusOpen={telemetryOpen} onStatus={() => setTelemetryOpen(value => !value)} fullscreen={fullscreen} onFullscreen={() => { void toggleFullscreen(); }} reducedMotion={reducedMotion} onReducedMotion={setReducedMotion}>
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
  </div>;
}
