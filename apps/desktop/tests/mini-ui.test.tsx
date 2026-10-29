// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { Connection, DesktopBridge, StreamEvent } from '../src/shared/contracts';
import type { WindowState } from '../src/shared/window-contracts';
import { offlineProvider } from '../src/main/offline';
import { DesktopService, desktopStatus } from '../src/main/service';
import { App } from '../src/renderer/App';
import { ReductionSettings } from '../src/renderer/ReductionSettings';
import type { ReductionResult } from '../src/shared/reduction-contracts';

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
    getReductionPreference: vi.fn(async () => ({ ok: true, preference: { mode: 'circle', status: 'default' } } as const)),
    setReductionMode: vi.fn(async ({ mode }) => ({ ok: true, preference: { mode, status: 'saved' } } as const)),
    reduceToMini: vi.fn(async () => ({ ok: true as const })),
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

it('reopens the technical section after Escape and verifies real offline cancellation in the visible demo', async () => {
  const { bridge, emit } = fixture();
  const service = new DesktopService(offlineProvider, emit);
  vi.mocked(bridge.startOfflineDemo).mockImplementation(async input => service.handle({ type: 'startOfflineDemo', input }));
  vi.mocked(bridge.cancel).mockImplementation(async input => service.handle({ type: 'cancel', input }));
  const user = userEvent.setup();
  render(<App />);
  try {
    let menu = await openMenu(user);
    await user.click(menu.getByRole('button', { name: 'Informazioni e strumenti tecnici' }));
    await user.click(menu.getByText('Banco di prova offline', { selector: 'summary' }));
    await user.click(menu.getByRole('button', { name: 'Avvia demo offline' }));
    const requestId = vi.mocked(bridge.startOfflineDemo).mock.calls[0]![0].requestId;
    await user.keyboard('{Escape}');
    // jsdom needs the native dialog cancellation event supplied explicitly.
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bridge.cancel).toHaveBeenCalledWith({ requestId });
    menu = await openMenu(user);
    // Menu correctly starts in controls: hidden status is not an observable result.
    expect(menu.queryByRole('status')).toBeNull();
    await user.click(menu.getByRole('button', { name: 'Informazioni e strumenti tecnici' }));
    const tools = document.querySelector<HTMLDetailsElement>('.developer-tools')!;
    if (!tools.open) await user.click(menu.getByText('Banco di prova offline', { selector: 'summary' }));
    expect(tools.open).toBe(true);
    await waitFor(() => expect(menu.getByRole('status').textContent).toBe('Demo offline annullata'));
    expect(bridge.connectChatGPT).not.toHaveBeenCalled();
    expect(bridge.startChatGPT).not.toHaveBeenCalled();
  } finally { service.dispose(); }
});

it('reduces through the menu without remounting chat or losing draft, selected model, transcript or connection', async () => {
  const f = fixture(true); const user = userEvent.setup(); render(<App />);
  let menu = await openMenu(user);
  await user.click(menu.getByRole('button', { name: 'ChatGPT e modelli' }));
  await user.selectOptions(menu.getByLabelText('Modello autorizzato selezionato'), 'fixture-model');
  await user.click(menu.getByRole('button', { name: 'Chiudi menu' }));
  const prompt = screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)');
  await user.type(prompt, 'Turno sintetico precedente');
  await user.click(screen.getByRole('checkbox', { name: /Ho verificato quota/ }));
  await user.click(screen.getByRole('button', { name: 'Invia a ChatGPT' }));
  const requestId = vi.mocked(f.bridge.startChatGPT).mock.calls[0]![0].requestId;
  f.emit({ type: 'textDelta', requestId, text: 'Risposta sintetica conservata' });
  // Reduction while a simulated stream is active must not cancel it or remove its listener.
  const listeners = f.events.size;
  menu = await openMenu(user); await user.click(menu.getByRole('button', { name: 'Riduci a Mini' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  f.emit({ type: 'responseCompleted', requestId });
  await user.clear(prompt); await user.type(prompt, 'Bozza non inviata');
  const history = document.querySelector('.chat-history');
  menu = await openMenu(user); await user.click(menu.getByRole('button', { name: 'Riduci a Mini' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByLabelText('Messaggio per ChatGPT (massimo 2000 caratteri)')).toBe(prompt);
  expect((prompt as HTMLTextAreaElement).value).toBe('Bozza non inviata');
  expect(document.querySelector('.chat-history')).toBe(history);
  expect(history?.textContent).toContain('Risposta sintetica conservata');
  expect(f.events.size).toBe(listeners); expect(f.bridge.getConnection).toHaveBeenCalledOnce();
  menu = await openMenu(user); await user.click(menu.getByRole('button', { name: 'ChatGPT e modelli' }));
  expect((menu.getByLabelText('Modello autorizzato selezionato') as HTMLSelectElement).value).toBe('fixture-model');
  expect(menu.getByText('Collegato')).toBeTruthy();
  expect(f.bridge.reduceToMini).toHaveBeenCalledTimes(2);
  expect(f.bridge.startChatGPT).toHaveBeenCalledTimes(1); // Only the explicit synthetic send above.
  expect(f.bridge.connectChatGPT).not.toHaveBeenCalled(); expect(f.bridge.cancel).not.toHaveBeenCalled();
});

it('locks duplicate reductions and leaves the existing session/menu reachable on failure without retry', async () => {
  const f = fixture(); const user = userEvent.setup(); render(<App />);
  let finish!: (value: { ok: false; code: 'unavailable' }) => void;
  vi.mocked(f.bridge.reduceToMini).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const menu = await openMenu(user), reduce = menu.getByRole('button', { name: 'Riduci a Mini' }) as HTMLButtonElement;
  await user.click(reduce); await user.click(reduce);
  expect(reduce.disabled).toBe(true); expect(f.bridge.reduceToMini).toHaveBeenCalledOnce();
  await act(async () => { finish({ ok: false, code: 'unavailable' }); });
  expect(screen.getByRole('alert').textContent).toContain('Modalità Mini non disponibile');
  expect(screen.queryByRole('dialog')).toBeNull(); expect(reduce.disabled).toBe(false);
  expect(f.bridge.reduceToMini).toHaveBeenCalledOnce();
  expect(f.bridge.connectChatGPT).not.toHaveBeenCalled(); expect(f.bridge.startChatGPT).not.toHaveBeenCalled();
});

it('offers Reduce to Mini in the fullscreen topbar using the same guarded launcher', async () => {
  const f = fixture(), user = userEvent.setup(); render(<App />);
  expect(document.querySelector('.mini-topbar [aria-label="Riduci a Mini"]')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Schermo intero' }));
  const reduce = screen.getByRole('button', { name: 'Riduci a Mini' });
  expect(document.querySelector('.mini-topbar')?.contains(reduce)).toBe(true);
  await user.click(reduce); expect(f.bridge.reduceToMini).toHaveBeenCalledOnce();
  expect(f.bridge.connectChatGPT).not.toHaveBeenCalled(); expect(f.bridge.startChatGPT).not.toHaveBeenCalled();
});

it('offers accessible persisted reduction choices, updates the disclosure and reports safe save fallback', async () => {
  const { bridge } = fixture(), user = userEvent.setup(); render(<App />);
  const menu = await openMenu(user); await user.click(menu.getByRole('button', { name: 'Impostazioni' }));
  const circle = menu.getByRole('radio', { name: 'Cerchio Mini — in basso a destra' });
  const island = menu.getByRole('radio', { name: 'NEYDRA Island — in alto al centro' });
  expect((circle as HTMLInputElement).checked).toBe(true);
  await user.click(island);
  await waitFor(() => expect((island as HTMLInputElement).checked).toBe(true));
  expect(bridge.setReductionMode).toHaveBeenCalledWith({ mode: 'island' });
  expect(menu.getByRole('status').textContent).toContain('prossima riduzione');
  expect(menu.getByText(/salvata localmente soltanto la modalità/)).toBeTruthy();
  vi.mocked(bridge.setReductionMode).mockResolvedValueOnce({ ok: true, preference: { mode: 'circle', status: 'save-failed' } });
  await user.click(circle);
  await waitFor(() => expect(menu.getByRole('status').textContent).toContain('Salvataggio non riuscito'));
  expect((circle as HTMLInputElement).checked).toBe(true);
  expect(bridge.startChatGPT).not.toHaveBeenCalled(); expect(bridge.connectChatGPT).not.toHaveBeenCalled();
});

it.each(['saved', 'fallback', 'rejected'] as const)('acknowledges a radio click before slow IPC/disk finishes (%s), then confirms or rolls back', async outcome => {
  const { bridge } = fixture();
  let finish!: (result: ReductionResult) => void, fail!: (error: Error) => void;
  vi.mocked(bridge.setReductionMode).mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  render(<ReductionSettings />);
  const circle = screen.getByRole('radio', { name: 'Cerchio Mini — in basso a destra' }) as HTMLInputElement;
  const island = screen.getByRole('radio', { name: 'NEYDRA Island — in alto al centro' }) as HTMLInputElement;
  await waitFor(() => expect(circle.matches(':disabled')).toBe(false));
  // fireEvent returns after React's synchronous event commit. No waitFor, DOM
  // mutation or forced locator can conceal a controlled radio reverting here.
  fireEvent.click(island);
  expect(island.checked).toBe(true); expect(circle.checked).toBe(false);
  expect(screen.getByRole('status').textContent).toContain('Scelta provvisoria');
  expect(island.matches(':disabled') && circle.matches(':disabled')).toBe(true);
  circle.click(); expect(bridge.setReductionMode).toHaveBeenCalledOnce();
  expect(island.checked).toBe(true);
  await act(async () => {
    if (outcome === 'rejected') fail(new Error('synthetic IPC failure'));
    else finish({ ok: true, preference: { mode: outcome === 'saved' ? 'island' : 'circle', status: outcome === 'saved' ? 'saved' : 'save-failed' } });
  });
  expect(island.checked).toBe(outcome === 'saved'); expect(circle.checked).toBe(outcome !== 'saved');
  expect(island.matches(':disabled') || circle.matches(':disabled')).toBe(false);
  expect(screen.getByRole('status').textContent).toContain(outcome === 'saved' ? 'Preferenza salvata' : 'Salvataggio non riuscito');
  expect(bridge.setReductionMode).toHaveBeenCalledOnce(); expect(bridge.connectChatGPT).not.toHaveBeenCalled(); expect(bridge.startChatGPT).not.toHaveBeenCalled();
});
