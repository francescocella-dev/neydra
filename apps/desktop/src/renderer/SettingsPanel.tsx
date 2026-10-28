import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { Icon, IconButton } from './Icon';
import oxaniumLicense from './fonts/OFL-oxanium.txt?raw';
import manropeLicense from './fonts/OFL-manrope.txt?raw';

export type MenuSection = 'controls' | 'account' | 'theme' | 'settings' | 'technical';
interface Props {
  open: boolean;
  onDismiss(): void;
  section: MenuSection;
  onSection(value: MenuSection): void;
  accountRef: Ref<HTMLDivElement>;
  chatOpen: boolean;
  onChat(): void;
  statusOpen: boolean;
  onStatus(): void;
  fullscreen: boolean;
  onFullscreen(): void;
  onCompanion(): void;
  companionPending: boolean;
  reducedMotion: boolean;
  onReducedMotion(value: boolean): void;
  children: ReactNode;
}
export function SettingsPanel({ open, onDismiss, section, onSection, accountRef, chatOpen, onChat, statusOpen, onStatus, fullscreen, onFullscreen, onCompanion, companionPending, reducedMotion, onReducedMotion, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    else if (!open && element?.open) element.close();
  }, [open]);
  return <dialog ref={dialog} id="mini-settings" className="settings-dialog" aria-labelledby="settings-title"
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    onClick={event => { if (event.target === event.currentTarget) onDismiss(); }}>
    <div className="settings-surface">
      <header className="settings-heading"><h2 id="settings-title">Pannello di controllo</h2><IconButton icon="close" label="Chiudi menu" onClick={onDismiss} /></header>
      <div className="menu-scroll">
        <nav className="control-navigation" aria-label="Controlli Mini">
          <button type="button" onClick={onCompanion} disabled={companionPending}><Icon name="mini" />Riduci a Mini</button>
          <button type="button" aria-current={section === 'account' ? 'page' : undefined} onClick={() => onSection('account')}><Icon name="connection" />ChatGPT e modelli</button>
          <button type="button" aria-pressed={chatOpen} aria-controls="conversation-panel" onClick={onChat}><Icon name="chat" />{chatOpen ? 'Nascondi chat' : 'Mostra chat'}</button>
          <button type="button" aria-pressed={statusOpen} aria-controls="status-panel" onClick={onStatus}><Icon name="status" />{statusOpen ? 'Nascondi stato' : 'Mostra stato'}</button>
          <button type="button" aria-current={section === 'theme' ? 'page' : undefined} onClick={() => onSection('theme')}><Icon name="theme" />Tema e aspetto</button>
          <button type="button" aria-current={section === 'settings' ? 'page' : undefined} onClick={() => onSection('settings')}><Icon name="settings" />Impostazioni</button>
          <button type="button" onClick={onFullscreen}><Icon name={fullscreen ? 'collapse' : 'expand'} />{fullscreen ? 'Esci da schermo intero' : 'Schermo intero'}<kbd>F11</kbd></button>
          <button type="button" aria-current={section === 'technical' ? 'page' : undefined} onClick={() => onSection('technical')}><Icon name="info" />Informazioni e strumenti tecnici</button>
        </nav>
        <div className="settings-content">
          <section hidden={section !== 'account'} aria-label="ChatGPT e modelli"><h3>ChatGPT e modelli</h3><div ref={accountRef} /></section>
          <section hidden={section !== 'theme'} aria-label="Tema e aspetto"><h3>Tema Mini</h3><div className="palette-preview" aria-label="Palette nero, grafite, arancio e bianco morbido"><i/><i/><i/><i/></div><label className="check-label"><input type="checkbox" checked={reducedMotion} onChange={event => onReducedMotion(event.target.checked)} /> Riduci le animazioni di sfondo</label><p className="muted">La preferenza di movimento ridotto di Windows è sempre rispettata. Questa scelta dura per la finestra corrente.</p><p>Oxanium e Manrope sono inclusi localmente. Nessun CDN.</p></section>
          <section hidden={section !== 'settings'} aria-label="Impostazioni"><h3>Voce e ascolto</h3><p>Voce non ancora disponibile. Microfono e videocamera disattivati.</p><h3>Sessione</h3><p>Conversazione solo in memoria. Nessuna preferenza o cronologia viene salvata su disco da questa interfaccia.</p></section>
          <section hidden={section !== 'technical'} aria-label="Informazioni e strumenti tecnici"><h3>Informazioni</h3><p>Pre-alpha. Modello 3D e voce non integrati. Il companion usa un segno temporaneo NEYDRA.</p>{children}<details className="font-licenses"><summary>Licenze dei font locali · SIL OFL 1.1</summary><h4>Oxanium</h4><pre>{oxaniumLicense}</pre><h4>Manrope</h4><pre>{manropeLicense}</pre></details></section>
        </div>
      </div>
    </div>
  </dialog>;
}
