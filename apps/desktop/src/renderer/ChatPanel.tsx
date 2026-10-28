import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import type { Connection } from '../shared/contracts';
import { demoReducer, initialState } from './model';

const disconnected: Connection = { state: 'disconnected', models: [] };
export function ChatPanel() {
  const [connection, setConnection] = useState<Connection>(disconnected);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('Integrazione Windows da verificare.');
  const [transcript, setTranscript] = useState<{ prompt: string; text: string }[]>([]);
  const [chat, dispatch] = useReducer(demoReducer, initialState);
  const lock = useRef(false);
  const active = useRef<string | null>(null);
  const mounted = useRef(true);
  const [submitted, setSubmitted] = useState('');

  async function refresh() {
    const value = await window.neydra.getConnection();
    if (mounted.current) {
      setConnection(value);
      setModel(current => value.models.some(model => model.slug === current) ? current : '');
    }
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
      if (mounted.current) setNotice(result.ok ? 'Connessione verificata. Scegli un modello.' : 'Connessione non riuscita o annullata. Nessun retry automatico.');
      await refresh();
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
  return <section className="demo connected-chat" aria-labelledby="chat-title">
    <h2 id="chat-title">ChatGPT · piano autorizzato</h2>
    <p>Stato connessione (ultima verifica): <strong>{connection.state}</strong> · sessione solo in memoria, senza rinnovo automatico.</p>
    <p>Il piano ha limiti condivisi; quota e fatturazione non sono verificabili dall’app. Nessuna garanzia di costo zero: prima di ogni invio verifica quota inclusa, crediti acquistati a zero e ricarica automatica disattivata nelle impostazioni ChatGPT. Se non puoi verificarli, fermati.</p>
    <p>Solo testo, massimo 2000 caratteri per invio e 16384 in risposta; contesto fino a 20 messaggi / 32000 caratteri. Il contesto dei turni completati viene reinviato. Nessun salvataggio conversazioni.</p>
    <div className="actions">
      <button type="button" onClick={() => { void refresh().catch(() => setNotice('Stato non disponibile.')); }} disabled={connection.state === 'connecting'}>Aggiorna stato locale</button>
      <button type="button" onClick={() => { void connect(); }} disabled={connection.state !== 'disconnected' || chat.running}>Continue with ChatGPT</button>
      <button type="button" onClick={() => { void window.neydra.cancelConnect().catch(() => setNotice('Bridge non disponibile.')); }} disabled={connection.state !== 'connecting'}>Annulla accesso</button>
      <button type="button" onClick={() => { void disconnect(); }} disabled={connection.state === 'disconnected'}>Disconnetti</button>
    </div>
    <p aria-live="polite">{notice}</p>
    <label htmlFor="chat-model">Modello autorizzato selezionato</label>
    <select id="chat-model" value={model} disabled={chat.running || connection.state !== 'connected'} onChange={event => { setModel(event.target.value); setConsent(false); }}>
      <option value="">Scegli dal catalogo della connessione</option>
      {connection.models.map(model => <option key={model.slug} value={model.slug}>{model.name} ({model.slug})</option>)}
    </select>
    {transcript.map((turn, index) => <div key={index} className="caption"><p>Tu: {turn.prompt}</p><p>Risposta precedente (può essere parziale): {turn.text}</p></div>)}
    <p>Tu: {submitted}</p>
    <div className="caption" aria-label="Risposta ChatGPT">{chat.text || 'La risposta progressiva comparirà qui.'}</div>
    <form onSubmit={event => { void send(event); }}>
      <label htmlFor="chat-prompt">Messaggio per ChatGPT (massimo 2000 caratteri)</label>
      <textarea id="chat-prompt" rows={3} maxLength={2000} value={prompt} disabled={chat.running} onChange={event => { setPrompt(event.target.value); setConsent(false); }} />
      <label><input type="checkbox" checked={consent} disabled={chat.running || connection.state !== 'connected'} onChange={event => setConsent(event.target.checked)} /> Ho verificato quota inclusa, crediti acquistati zero e ricarica disattivata. Autorizzo questo singolo invio e il contesto precedente al modello selezionato.</label>
      <div className="actions">
        <button type="submit" disabled={!consent || !model || !prompt.trim() || chat.running || connection.state !== 'connected'}>Invia a ChatGPT</button>
        <button type="button" disabled={!chat.running} onClick={() => { if (active.current) void window.neydra.cancel({ requestId: active.current }).catch(() => setNotice('Annullamento non disponibile.')); }}>Annulla risposta / Esc</button>
        <button type="button" disabled={chat.running} onClick={() => { void reset(); }}>Nuova conversazione</button>
      </div>
    </form>
  </section>;
}
