// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { Connection, DesktopBridge, StreamEvent } from '../src/shared/contracts';
import type { WindowState } from '../src/shared/window-contracts';
import { desktopStatus } from '../src/main/service';
import { App } from '../src/renderer/App';

beforeAll(() => {
  // jsdom does not implement native dialog/fullscreen. Only renderer state is tested here.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
function fixture(connected = false) {
  let connection: Connection = connected ? { state: 'connected', models: [{ slug: 'fixture-model', name: 'Modello sintetico' }] } : { state: 'disconnected', models: [] };
  const events = new Set<(event: StreamEvent) => void>();
  const windowEvents = new Set<(state: WindowState) => void>();
  const bridge: DesktopBridge = {
    getStatus: vi.fn(async () => desktopStatus), getConnection: vi.fn(async () => connection),
    connectChatGPT: vi.fn(async () => ({ ok: true as const })),
    disconnectChatGPT: vi.fn(async () => { connection = { state: 'disconnected', models: [] }; return { ok: true as const }; }),
    cancelConnect: vi.fn(async () => ({ ok: true as const })), resetChat: vi.fn(async () => ({ ok: true as const })),
    startChatGPT: vi.fn(async () => ({ ok: true as const })), startOfflineDemo: vi.fn(async () => ({ ok: true as const })), cancel: vi.fn(async () => ({ ok: true as const })),
    onEvent: vi.fn(listener => { events.add(listener); return () => { events.delete(listener); }; }),
    getWindowState: vi.fn(async () => ({ ok: true as const, state: { fullscreen: false } })),
    setFullscreen: vi.fn(async input => { for (const listener of windowEvents) listener({ fullscreen: input.enabled }); return { ok: true as const, state: { fullscreen: input.enabled } }; }),
    onWindowState: vi.fn(listener => { windowEvents.add(listener); return () => { windowEvents.delete(listener); }; }),
  };
  Object.defineProperty(window, 'neydra', { value: bridge, configurable: true });
  return { bridge, emit(event: StreamEvent) { act(() => { for (const listener of events) listener(event); }); }, events, windowEvents };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Apri menu' }));
  return within(screen.getByRole('dialog', { name: 'Pannello di controllo' }));
}
async function togglePanel(user: ReturnType<typeof userEvent.setup>, name: string) {
  const menu = await openMenu(user);
  await user.click(menu.getByRole('button', { name }));
  await user.click(menu.getByRole('button', { name: 'Chiudi menu' }));
}
it('keeps the minimal brand and preserves typed input while panels are hidden through the menu', async () => {
  const { bridge, events, windowEvents } = fixture(); const user = userEvent.setup(); const view = render(<App />);
  expect(screen.getByRole('heading', { name: 'NEYDRA' })).toBeTruthy();
  expect(document.querySelector('.brand')?.textContent).toBe('NEYDRAMINI');
  expect(screen.queryByText('Il tuo spazio, con Mini')).toBeNull();
  expect(screen.queryByText('Da dove iniziamo?')).toBeNull();
  expect(document.querySelector('.mini-topbar')?.querySelectorAll('button')).toHaveLength(3);
  await user.type(screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)'), 'Idea locale da conservare');
  await togglePanel(user, 'Nascondi chat');
  expect(screen.queryByRole('region', { name: 'Conversazione ChatGPT' })).toBeNull();
  await togglePanel(user, 'Mostra chat');
  expect((screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)') as HTMLTextAreaElement).value).toBe('Idea locale da conservare');
  expect(screen.queryByRole('complementary')).toBeNull();
  await togglePanel(user, 'Mostra stato');
  expect(screen.getByRole('complementary').textContent).toContain('Non disponibile');
  await togglePanel(user, 'Nascondi stato');
  expect((screen.getByRole('button', { name: 'Invia a ChatGPT' }) as HTMLButtonElement).disabled).toBe(true);
  expect(bridge.startChatGPT).not.toHaveBeenCalled(); expect(bridge.connectChatGPT).not.toHaveBeenCalled();
  view.unmount(); expect(events.size).toBe(0); expect(windowEvents.size).toBe(0);
});
it('opens every menu route, keeps account controls available with chat hidden and exposes only the technical offline demo', async () => {
  const { bridge } = fixture(); const user = userEvent.setup(); render(<App />);
  await togglePanel(user, 'Nascondi chat');
  const menu = await openMenu(user);
  await user.click(menu.getByRole('button', { name: 'ChatGPT e modelli' }));
  expect(menu.getByRole('button', { name: 'Continue with ChatGPT' })).toBeTruthy();
  expect(menu.getByLabelText('Modello autorizzato selezionato')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Conversazione ChatGPT' })).toBeNull();
  await user.click(menu.getByRole('button', { name: 'Tema e aspetto' }));
  await user.click(menu.getByRole('checkbox', { name: /Riduci le animazioni/ }));
  expect(document.querySelector('.mini-shell')?.classList.contains('motion-paused')).toBe(true);
  await user.click(menu.getByRole('button', { name: 'Impostazioni' }));
  expect(menu.getByText(/Voce non ancora disponibile/)).toBeTruthy();
  await user.click(menu.getByRole('button', { name: 'Informazioni e strumenti tecnici' }));
  await user.click(menu.getByText('Banco di prova offline', { selector: 'summary' }));
  await user.click(menu.getByRole('button', { name: 'Avvia demo offline' }));
  expect(bridge.startOfflineDemo).toHaveBeenCalledTimes(1); expect(bridge.connectChatGPT).not.toHaveBeenCalled();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('offers named icon controls and a disabled microphone without requesting capture or authentication', async () => {
  const { bridge } = fixture(); const user = userEvent.setup(); render(<App />);
  const capture = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: capture } });
  const microphone = screen.getByRole('button', { name: 'Voce non ancora disponibile' }) as HTMLButtonElement;
  expect(microphone.disabled).toBe(true); expect(microphone.getAttribute('aria-describedby')).toBeTruthy();
  await user.click(microphone);
  await user.tab(); expect(document.activeElement?.getAttribute('aria-label')).toBeTruthy();
  expect(capture).not.toHaveBeenCalled(); expect(bridge.connectChatGPT).not.toHaveBeenCalled(); expect(bridge.startChatGPT).not.toHaveBeenCalled();
});
it('keeps native fullscreen and a named exit reachable from icons and the menu', async () => {
  const { bridge } = fixture(); const user = userEvent.setup(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Schermo intero' }));
  expect(bridge.setFullscreen).toHaveBeenLastCalledWith({ enabled: true });
  await user.click(screen.getByRole('button', { name: 'Esci da schermo intero' }));
  expect(bridge.setFullscreen).toHaveBeenLastCalledWith({ enabled: false });
  const menu = await openMenu(user);
  await user.click(menu.getByRole('button', { name: /Schermo intero/ }));
  expect(bridge.setFullscreen).toHaveBeenLastCalledWith({ enabled: true });
});
it('preserves model, per-send consent and progressive conversation across hide/reopen, with an always available Stop', async () => {
  const { bridge, emit } = fixture(true); const user = userEvent.setup(); render(<App />);
  const input = screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)');
  const menu = await openMenu(user);
  await user.click(menu.getByRole('button', { name: 'ChatGPT e modelli' }));
  await menu.findByRole('option', { name: /Modello sintetico/ });
  await user.selectOptions(menu.getByLabelText('Modello autorizzato selezionato'), 'fixture-model');
  await user.click(menu.getByRole('button', { name: 'Chiudi menu' }));
  await user.type(input, 'Ciao Mini');
  expect((screen.getByRole('button', { name: 'Invia a ChatGPT' }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole('checkbox', { name: /Ho verificato quota/ }));
  await user.click(screen.getByRole('button', { name: 'Invia a ChatGPT' }));
  expect(bridge.startChatGPT).toHaveBeenCalledTimes(1);
  const sent = vi.mocked(bridge.startChatGPT).mock.calls[0]![0];
  expect(sent).toMatchObject({ prompt: 'Ciao Mini', model: 'fixture-model', consent: 'included-plan-checked' });
  emit({ type: 'textDelta', requestId: sent.requestId, text: 'Ciao dalla fixture.' });
  await togglePanel(user, 'Nascondi chat');
  emit({ type: 'textDelta', requestId: sent.requestId, text: ' Nessuna rete.' });
  await togglePanel(user, 'Mostra chat');
  expect(screen.getByLabelText('Risposta ChatGPT').textContent).toContain('Ciao dalla fixture. Nessuna rete.');
  expect(screen.getByRole('button', { name: 'Stop risposta' })).toBeTruthy();
  emit({ type: 'responseCompleted', requestId: sent.requestId, missingMimeStreamValidated: true });
  expect((screen.getByRole('button', { name: 'Invia a ChatGPT' }) as HTMLButtonElement).disabled).toBe(true);
  expect(document.querySelector('.chat-notice')?.textContent).toBe('Risposta completata');
  expect(screen.getByText('ChatGPT: costi zero non garantiti.')).toBeTruthy();
  await user.clear(input); await user.type(input, 'Secondo turno');
  await user.click(screen.getByRole('checkbox', { name: /Ho verificato quota/ }));
  await user.click(screen.getByRole('button', { name: 'Invia a ChatGPT' }));
  expect(screen.getByText('Ciao Mini')).toBeTruthy(); expect(screen.getByText('Ciao dalla fixture. Nessuna rete.')).toBeTruthy();
  const second = vi.mocked(bridge.startChatGPT).mock.calls[1]![0];
  await user.click(screen.getByRole('button', { name: 'Stop risposta' }));
  expect(bridge.cancel).toHaveBeenCalledWith({ requestId: second.requestId });
  emit({ type: 'responseCancelled', requestId: second.requestId });
  expect(document.querySelector('.chat-notice')?.textContent).toBe('Richiesta annullata');
  expect(bridge.startChatGPT).toHaveBeenCalledTimes(2);
});
it('renders a long streamed response and full-size input without moving controls into the transcript', async () => {
  const { bridge, emit } = fixture(true); const user = userEvent.setup(); render(<App />);
  const menu = await openMenu(user);
  await user.click(menu.getByRole('button', { name: 'ChatGPT e modelli' }));
  await menu.findByRole('option', { name: /Modello sintetico/ });
  await user.selectOptions(menu.getByLabelText('Modello autorizzato selezionato'), 'fixture-model');
  await user.click(menu.getByRole('button', { name: 'Chiudi menu' }));
  await user.type(screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)'), 'Test lungo');
  await user.click(screen.getByRole('checkbox', { name: /Ho verificato quota/ }));
  await user.click(screen.getByRole('button', { name: 'Invia a ChatGPT' }));
  const requestId = vi.mocked(bridge.startChatGPT).mock.calls[0]![0].requestId;
  for (let i = 0; i < 4; i++) emit({ type: 'textDelta', requestId, text: 'x'.repeat(4096) });
  expect(screen.getByLabelText('Risposta ChatGPT').textContent).toContain('x'.repeat(16384));
  const history = screen.getByLabelText('Cronologia della conversazione');
  expect(history.contains(screen.getByRole('button', { name: 'Stop risposta' }))).toBe(false);
  expect(history.contains(screen.getByRole('checkbox', { name: /Ho verificato quota/ }))).toBe(false);
});
