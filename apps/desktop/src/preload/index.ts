import { WINDOW_CHANNELS, fullscreenInputSchema, windowResultSchema, windowStateSchema } from '../shared/window-contracts';
import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, connectionSchema, connectSchema, realSchema, cancelSchema, responseSchema, resultSchema, startSchema, statusSchema, streamEventSchema, type DesktopBridge } from '../shared/contracts';

const bridge = Object.freeze<DesktopBridge>({
  async getWindowState() { return windowResultSchema.parse(await ipcRenderer.invoke(WINDOW_CHANNELS.invoke, { type: 'getState' })); },
  async setFullscreen(input) {
    const parsed = fullscreenInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid-request' };
    return windowResultSchema.parse(await ipcRenderer.invoke(WINDOW_CHANNELS.invoke, { type: 'setFullscreen', input: parsed.data }));
  },
  onWindowState(listener) {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      const parsed = windowStateSchema.safeParse(raw);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(WINDOW_CHANNELS.event, handler);
    return () => ipcRenderer.removeListener(WINDOW_CHANNELS.event, handler);
  },
  async getStatus() {
    const result = responseSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'status' }));
    if (!result.ok) throw new Error('Desktop status unavailable');
    return statusSchema.parse(result.status);
  },
  async getConnection() {
    const result = responseSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'connection' }));
    if (!result.ok) throw new Error('Connection unavailable');
    return connectionSchema.parse(result.connection);
  },
  async connectChatGPT(input) {
    const parsed = connectSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid-request' };
    return resultSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'connectChatGPT', input: parsed.data }));
  },
  async disconnectChatGPT() { return resultSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'disconnectChatGPT' })); },
  async cancelConnect() { return resultSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'cancelConnect' })); },
  async resetChat() { return resultSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'resetChat' })); },
  async startChatGPT(input) {
    const parsed = realSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid-request' };
    return resultSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'startChatGPT', input: parsed.data }));
  },
  async startOfflineDemo(input) {
    const parsed = startSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid-request' };
    return resultSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'startOfflineDemo', input: parsed.data }));
  },
  async cancel(input) {
    const parsed = cancelSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid-request' };
    return resultSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'cancel', input: parsed.data }));
  },
  onEvent(listener) {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      const parsed = streamEventSchema.safeParse(raw);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(CHANNELS.event, handler);
    return () => ipcRenderer.removeListener(CHANNELS.event, handler);
  },
});
contextBridge.exposeInMainWorld('neydra', bridge);
