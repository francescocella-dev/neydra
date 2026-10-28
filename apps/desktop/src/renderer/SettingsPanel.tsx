import { useEffect, useRef, useState, type ReactNode } from 'react';
import oxaniumLicense from './fonts/OFL-oxanium.txt?raw';
import manropeLicense from './fonts/OFL-manrope.txt?raw';

const sections = ['ChatGPT e modelli', 'Tema e aspetto', 'Voce e ascolto', 'Finestra e visualizzazione', 'Informazioni e strumenti tecnici'] as const;
interface Props {
  open: boolean;
  onDismiss(): void;
  onAccount(): void;
  fullscreen: boolean;
  onFullscreen(): void;
  reducedMotion: boolean;
  onReducedMotion(value: boolean): void;
  children: ReactNode;
}
export function SettingsPanel({ open, onDismiss, onAccount, fullscreen, onFullscreen, reducedMotion, onReducedMotion, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<typeof sections[number]>(sections[0]);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    else if (!open && element?.open) element.close();
  }, [open]);
  return <dialog ref={dialog} id="mini-settings" className="settings-dialog" aria-labelledby="settings-title"
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    onClick={event => { if (event.target === event.currentTarget) onDismiss(); }}>
    <div className="settings-surface">
      <header className="settings-heading"><div><span className="eyebrow">Il tuo spazio</span><h2 id="settings-title">Impostazioni</h2></div>
        <button type="button" aria-label="Chiudi impostazioni" onClick={onDismiss}>Chiudi <span aria-hidden="true">×</span></button>
      </header>
      <div className="settings-body">
        <nav aria-label="Sezioni impostazioni">{sections.map(item => <button type="button" key={item} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item}<span aria-hidden="true">›</span></button>)}</nav>
        <div className="settings-content">
          <section hidden={section !== sections[0]} aria-label={sections[0]}><h3>Una connessione, il tuo piano.</h3><p>Gestisci accesso, disconnessione e modello nella conversazione. Non verrà inviato alcun messaggio aprendo i controlli.</p><button type="button" className="accent-button" onClick={onAccount}>Apri accesso ChatGPT</button><p className="muted">Quota e fatturazione vanno verificate nell’account ChatGPT. NEYDRA non riceve questi contatori.</p></section>
          <section hidden={section !== sections[1]} aria-label={sections[1]}><h3>L’identità di Mini</h3><p>Nero, grafite e arancione caldo. Il tema Mini è l’unico tema disponibile in questa versione.</p><div className="palette-preview" aria-label="Palette nero, grafite, arancio e bianco morbido"><i/><i/><i/><i/></div><label className="check-label"><input type="checkbox" checked={reducedMotion} onChange={event => onReducedMotion(event.target.checked)} /> Riduci le animazioni di sfondo</label><p className="muted">La preferenza di movimento ridotto di Windows è sempre rispettata. La scelta aggiuntiva dura per questa finestra.</p><h4>Tipografia locale</h4><p>Oxanium per i titoli, Manrope per lettura e controlli. Nessun font viene richiesto a servizi esterni.</p></section>
          <section hidden={section !== sections[2]} aria-label={sections[2]}><span className="status-pill">Non implementata</span><h3>Voce e ascolto</h3><p>Microfono e videocamera restano disattivati. Questa interfaccia non ascolta, non registra e non sintetizza audio.</p></section>
          <section hidden={section !== sections[3]} aria-label={sections[3]}><h3>Più spazio per Mini</h3><p>Usa F11 per entrare o uscire dallo schermo intero nativo. Il comando di uscita rimane nella barra superiore.</p><button type="button" onClick={onFullscreen}>{fullscreen ? 'Esci da schermo intero' : 'Attiva schermo intero'}</button><p className="muted">Barra del titolo e taskbar: la verifica sul PC Windows è ancora necessaria. Per testi più grandi usa il ridimensionamento 125% o 150% di Windows.</p></section>
          <section hidden={section !== sections[4]} aria-label={sections[4]}><h3>NEYDRA Mini · pre-alpha</h3><p>Interfaccia pronta per accogliere il modello 3D definitivo. Voce, companion circolare e tema Holo non sono integrati.</p>{children}<details className="font-licenses"><summary>Licenze dei font locali · SIL OFL 1.1</summary><h4>Oxanium</h4><pre>{oxaniumLicense}</pre><h4>Manrope</h4><pre>{manropeLicense}</pre></details></section>
        </div>
      </div>
    </div>
  </dialog>;
}
