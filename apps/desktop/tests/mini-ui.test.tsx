// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
it('preserves typed input across collapsed panels, shows truthful status and never starts authentication automatically', async () => {
  const { bridge, events, windowEvents } = fixture();
  const user = userEvent.setup();
  const view = render(<App />);
  await user.type(screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)'), 'Idea locale da conservare');
  await user.click(screen.getByRole('button', { name: 'Nascondi chat' }));
  expect(screen.queryByRole('region', { name: 'Conversazione ChatGPT' })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Apri chat' }));
  expect((screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)') as HTMLTextAreaElement).value).toBe('Idea locale da conservare');
  await user.click(screen.getByRole('button', { name: 'Nascondi stato' }));
  expect(screen.queryByRole('complementary')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Mostra stato' }));
  expect(screen.getByText('Quota non disponibile')).toBeTruthy();
  expect((screen.getByRole('button', { name: /Invia a ChatGPT/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(bridge.startChatGPT).not.toHaveBeenCalled(); expect(bridge.connectChatGPT).not.toHaveBeenCalled();
  view.unmount(); expect(events.size).toBe(0); expect(windowEvents.size).toBe(0);
});
it('opens settings sections, respects a local motion preference, exposes technical demo and returns to account controls', async () => {
  const { bridge } = fixture(); const user = userEvent.setup(); render(<App />);
  await user.click(screen.getByRole('button', { name: /Impostazioni/ }));
  expect(screen.getByRole('dialog', { name: 'Impostazioni' }).hasAttribute('open')).toBe(true);
  await user.click(screen.getByRole('button', { name: /Tema e aspetto/ }));
  await user.click(screen.getByRole('checkbox', { name: /Riduci le animazioni/ }));
  expect(document.querySelector('.mini-shell')?.classList.contains('motion-paused')).toBe(true);
  await user.click(screen.getByRole('button', { name: /Voce e ascolto/ }));
  expect(screen.getByText('Non implementata')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: /Informazioni e strumenti tecnici/ }));
  await user.click(screen.getByText('Banco di prova offline', { selector: 'summary' }));
  await user.click(screen.getByRole('button', { name: 'Avvia demo offline' }));
  expect(bridge.startOfflineDemo).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: /ChatGPT e modelli/ }));
  await user.click(screen.getByRole('button', { name: 'Apri accesso ChatGPT' }));
  await waitFor(() => expect(document.querySelector<HTMLDetailsElement>('#chat-account')?.open).toBe(true));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue with ChatGPT' })).toBeTruthy();
  expect(bridge.connectChatGPT).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /Impostazioni/ }));
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('reflects native fullscreen state and offers an explicit exit without using HTML fullscreen', async () => {
  const { bridge } = fixture(); const user = userEvent.setup(); render(<App />);
  await user.click(screen.getByRole('button', { name: /^Schermo intero/ }));
  expect(bridge.setFullscreen).toHaveBeenLastCalledWith({ enabled: true });
  await user.click(screen.getByRole('button', { name: /^Esci da schermo intero/ }));
  expect(bridge.setFullscreen).toHaveBeenLastCalledWith({ enabled: false });
});
it('keeps explicit model/consent rules and renders progressive user/assistant messages through hide/reopen and cancellation', async () => {
  const { bridge, emit } = fixture(true); const user = userEvent.setup(); render(<App />);
  const input = screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)');
  await screen.findByRole('option', { name: /Modello sintetico/ });
  await user.selectOptions(screen.getByLabelText('Modello autorizzato selezionato'), 'fixture-model');
  await user.type(input, 'Ciao Mini');
  const send = screen.getByRole('button', { name: /Invia a ChatGPT/ }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  await user.click(screen.getByRole('checkbox', { name: /Ho verificato quota/ }));
  await user.click(send);
  expect(bridge.startChatGPT).toHaveBeenCalledTimes(1);
  const sent = vi.mocked(bridge.startChatGPT).mock.calls[0]![0];
  expect(sent).toMatchObject({ prompt: 'Ciao Mini', model: 'fixture-model', consent: 'included-plan-checked' });
  emit({ type: 'textDelta', requestId: sent.requestId, text: 'Ciao dalla fixture.' });
  await user.click(screen.getByRole('button', { name: 'Nascondi chat' }));
  emit({ type: 'textDelta', requestId: sent.requestId, text: ' Nessuna rete.' });
  await user.click(screen.getByRole('button', { name: 'Apri chat' }));
  expect(screen.getByLabelText('Risposta ChatGPT').textContent).toContain('Ciao dalla fixture. Nessuna rete.');
  emit({ type: 'responseCompleted', requestId: sent.requestId, missingMimeStreamValidated: true });
  expect(send.disabled).toBe(true);
  expect(screen.getByText(/Risposta completata e verificata/)).toBeTruthy();
  await user.clear(input); await user.type(input, 'Secondo turno');
  await user.click(screen.getByRole('checkbox', { name: /Ho verificato quota/ })); await user.click(send);
  expect(screen.getByText('Ciao Mini')).toBeTruthy();
  expect(screen.getByText('Ciao dalla fixture. Nessuna rete.')).toBeTruthy();
  const second = vi.mocked(bridge.startChatGPT).mock.calls[1]![0];
  await user.click(screen.getByRole('button', { name: /^Stop/ }));
  expect(bridge.cancel).toHaveBeenCalledWith({ requestId: second.requestId });
  emit({ type: 'responseCancelled', requestId: second.requestId });
  expect(screen.getByText(/Richiesta annullata/)).toBeTruthy();
  expect(bridge.startChatGPT).toHaveBeenCalledTimes(2);
});
