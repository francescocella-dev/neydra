import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, cancelSchema, responseSchema, resultSchema, startSchema, statusSchema, streamEventSchema, type DesktopBridge } from '../shared/contracts';

const bridge = Object.freeze<DesktopBridge>({
  async getStatus() {
    const result = responseSchema.parse(await ipcRenderer.invoke(CHANNELS.invoke, { type: 'status' }));
    if (!result.ok) throw new Error('Desktop status unavailable');
    return statusSchema.parse(result.status);
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
