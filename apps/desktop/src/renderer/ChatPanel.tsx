import { createPortal } from 'react-dom';
import { IconButton } from './Icon';
import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import type { ChatView } from './chat-view';
import { connectionLabel } from './chat-view';
import type { Connection } from '../shared/contracts';
import { demoReducer, initialState } from './model';

const disconnected: Connection = { state: 'disconnected', models: [] };
export function ChatPanel({ onViewState, accountTarget, onOpenControls, visible = true }: {
  onViewState?: (state: ChatView) => void;
  accountTarget?: HTMLElement | null;
  onOpenControls?: () => void;
  visible?: boolean;
} = {}) {
  const [connection, setConnection] = useState<Connection>(disconnected);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('ChatGPT disponibile su collegamento esplicito. Nessun invio senza consenso.');
  const [transcript, setTranscript] = useState<{ prompt: string; text: string }[]>([]);
  const [chat, dispatch] = useReducer(demoReducer, initialState);
  const lock = useRef(false);
  const active = useRef<string | null>(null);
  const mounted = useRef(true);
  const [submitted, setSubmitted] = useState('');
  const history = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (visible && follow.current && history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [visible, chat.text, submitted]);

  const hasConversation = Boolean(chat.text);
  useEffect(() => {
    onViewState?.({ connection, selectedModel: model, running: chat.running, hasConversation });
  }, [connection, model, chat.running, hasConversation, onViewState]);

  async function refresh(): Promise<Connection> {
    const value = await window.neydra.getConnection();
    if (mounted.current) {
      setConnection(value);
      setModel(current => value.models.some(model => model.slug === current) ? current : '');
    }
    return value;
  }
  useEffect(() => {
    mounted.current = true;
    void window.neydra.getConnection().then(value => { if (mounted.current) setConnection(value); }).catch(() => { if (mounted.current) setNotice('Bridge non disponibile.'); });
    const off = window.neydra.onEvent(event => {
      if (event.requestId !== active.current) return;
      dispatch(event);
      if (['responseCompleted', 'responseFailed', 'responseCancelled'].includes(event.type)) {
        active.current = null; lock.current = false;
        setNotice(event.type === 'responseCompleted' ? `Risposta completata e verificata.${event.type === 'responseCompleted' && event.missingMimeStreamValidated ? ' SSE senza Content-Type validato.' : ''}` : event.type === 'responseCancelled' ? 'Richiesta annullata; il consumo già avvenuto non è rimborsato.' : `Richiesta interrotta (${event.type === 'responseFailed' ? event.code : ''}). Controlla quota e connessione prima di riprovare manualmente.`);
      }
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (active.current) void window.neydra.cancel({ requestId: active.current }).catch(() => {});
        void window.neydra.cancelConnect().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { mounted.current = false; off(); window.removeEventListener('keydown', onKey); };
  }, []);

  async function connect() {
    if (lock.current) return;
    lock.current = true;
    setConnection({ state: 'connecting', models: [] });
    setConsent(false);
    setNotice('Autorizza nel browser di sistema. Nessuna inferenza al collegamento.');
    try {
      const result = await window.neydra.connectChatGPT({ consent: 'system-browser' });
      const updated = await refresh();
      if (mounted.current) setNotice(result.ok
        ? 'Connessione verificata. Scegli un modello.'
        : updated.diagnostic
          ? `Connessione interrotta: fase ${updated.diagnostic.phase}, codice ${updated.diagnostic.code}${updated.diagnostic.httpStatus ? `, HTTP ${updated.diagnostic.httpStatus}` : ''}. Nessun retry automatico.`
          : 'Connessione non riuscita o annullata. Nessun retry automatico.');
    } catch { if (mounted.current) { setNotice('Connessione non disponibile.'); setConnection(disconnected); } }
    finally { lock.current = false; }
  }
  async function disconnect() {
    try { await window.neydra.disconnectChatGPT(); await refresh(); setConsent(false); setTranscript([]); setSubmitted(''); dispatch({ type: 'clear' }); setNotice('Sessione locale eliminata. Per revocare la connessione usa le impostazioni ChatGPT.'); }
    catch { setNotice('Bridge non disponibile.'); }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !consent || !model || !prompt.trim() || connection.state !== 'connected') return;
    lock.current = true;
    setConsent(false); // Each send requires a fresh manual acknowledgement.
    if (chat.text) setTranscript(items => [...items, { prompt: submitted, text: chat.text }].slice(-10));
    const requestId = crypto.randomUUID();
    active.current = requestId;
    setSubmitted(prompt);
    dispatch({ type: 'begin', requestId });
    setNotice('Risposta in corso; il testo parziale non prova il completamento.');
    try {
      const result = await window.neydra.startChatGPT({ requestId, prompt, model, consent: 'included-plan-checked' });
      if (result.ok) return;
      setNotice(`Invio rifiutato (${result.code}). Controlla connessione e quota.`);
      await refresh();
    } catch { setNotice('Invio non disponibile. Nessun retry automatico.'); }
    if (active.current === requestId) { active.current = null; lock.current = false; dispatch({ type: 'rejected', requestId }); }
  }
  async function reset() {
    try {
      const result = await window.neydra.resetChat();
      if (result.ok) { setTranscript([]); setSubmitted(''); dispatch({ type: 'clear' }); setNotice('Conversazione azzerata in memoria.'); }
    } catch { setNotice('Bridge non disponibile.'); }
  }
  const controls = <div className="account-content">
    <p className={`status-pill status-${connection.state}`}>{connectionLabel[connection.state]}</p>
    <div className="actions">
      <button type="button" onClick={() => { void refresh().catch(() => setNotice('Stato non disponibile.')); }} disabled={connection.state === 'connecting'}>Aggiorna stato locale</button>
      <button type="button" className="accent-button" onClick={() => { void connect(); }} disabled={connection.state !== 'disconnected' || chat.running}>Continue with ChatGPT</button>
      <button type="button" onClick={() => { void window.neydra.cancelConnect().catch(() => setNotice('Bridge non disponibile.')); }} disabled={connection.state !== 'connecting'}>Annulla accesso</button>
      <button type="button" onClick={() => { void disconnect(); }} disabled={connection.state === 'disconnected'}>Disconnetti</button>
    </div>
    <label htmlFor="chat-model">Modello autorizzato selezionato</label>
    <select id="chat-model" value={model} disabled={chat.running || connection.state !== 'connected'} onChange={event => { setModel(event.target.value); setConsent(false); }}>
      <option value="">Scegli dal catalogo della connessione</option>
      {connection.models.map(model => <option key={model.slug} value={model.slug}>{model.name} ({model.slug})</option>)}
    </select>
    <button type="button" className="text-button" disabled={chat.running} onClick={() => { void reset(); }}>Nuova conversazione</button>
    <p className="account-notice" aria-live="polite">{notice}</p>
    <details className="chat-info"><summary>Informazioni sul piano e sulla sessione</summary><p>Il piano ha limiti condivisi; quota e fatturazione non sono verificabili dall’app. Nessuna garanzia di costo zero: prima di ogni invio verifica quota inclusa, crediti acquistati a zero e ricarica automatica disattivata nelle impostazioni ChatGPT. Se non puoi verificarli, fermati.</p><p>Solo testo, massimo 2000 caratteri per invio e 16384 in risposta; contesto fino a 20 messaggi / 32000 caratteri. Il contesto dei turni completati viene reinviato. Nessun salvataggio conversazioni. Sessione senza rinnovo automatico.</p></details>
  </div>;
  return <section className="connected-chat" aria-label="Dialogo con NEYDRA">
    {accountTarget && createPortal(controls, accountTarget)}
    <div ref={history} className="chat-history" aria-label="Cronologia della conversazione" tabIndex={0} onScroll={event => {
      const element = event.currentTarget;
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
    }}>
      {transcript.map((turn, index) => <div key={index} className="conversation-turn"><article className="message message-user"><span className="message-author">Tu</span><p>{turn.prompt}</p></article><article className="message message-assistant"><span className="message-author">NEYDRA <span className="sr-only">· risposta precedente, può essere parziale</span></span><p>{turn.text}</p></article></div>)}
      {submitted && <article className="message message-user"><span className="message-author">Tu</span><p>{submitted}</p></article>}
      {submitted && <article className="message message-assistant current-response" aria-label="Risposta ChatGPT"><span className="message-author">NEYDRA</span><div>{chat.text || 'In attesa della risposta…'}</div></article>}
    </div>
    <div className="chat-composer">
      <p className="chat-notice" aria-live="polite">{chat.requestId ? chat.running ? 'Risposta in corso' : chat.state === 'error' ? 'Richiesta interrotta · dettagli nel menu' : chat.state === 'interrupted' ? 'Richiesta annullata' : 'Risposta completata' : ''}</p>
      <form onSubmit={event => { follow.current = true; void send(event); }}>
        <label htmlFor="chat-prompt" className="sr-only">Messaggio per ChatGPT (massimo 2000 caratteri)</label>
        <div className="composer-bar" aria-label="Compositore">
          <IconButton icon="mic" label="Voce non ancora disponibile" disabled />
          <textarea id="chat-prompt" rows={1} maxLength={2000} placeholder="Scrivi a NEYDRA…" value={prompt} disabled={chat.running} onChange={event => { setPrompt(event.target.value); setConsent(false); }} />
          {chat.running ? <IconButton icon="stop" label="Stop risposta" hint="Stop risposta · Esc" className="stop-button" onClick={() => { if (active.current) void window.neydra.cancel({ requestId: active.current }).catch(() => setNotice('Annullamento non disponibile.')); }} />
            : <IconButton icon="send" label="Invia a ChatGPT" type="submit" className="accent-button" disabled={!consent || !model || !prompt.trim() || connection.state !== 'connected'} />}
        </div>
        <label className="check-label consent-label"><input type="checkbox" checked={consent} disabled={chat.running || connection.state !== 'connected'} onChange={event => setConsent(event.target.checked)} /> Ho verificato quota inclusa, crediti acquistati zero e ricarica disattivata. Autorizzo solo questo invio e il contesto al modello scelto.</label>
        <div className="composer-meta"><span className="cost-reminder">ChatGPT: costi zero non garantiti.</span><button type="button" className="text-button" onClick={onOpenControls}>Gestisci modello</button></div>
      </form>
    </div>
  </section>;
}
