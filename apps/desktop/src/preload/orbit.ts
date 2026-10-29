import { contextBridge, ipcRenderer } from 'electron';
import { companionResultSchema } from '../shared/companion-contracts';
import { directionSchema, ORBIT_CHANNEL, ORBIT_EVENT, orbitRoleResultSchema, orbitVisibilitySchema, type OrbitBridge } from '../shared/orbit-contracts';

const invoke = async (type: string) => companionResultSchema.parse(await ipcRenderer.invoke(ORBIT_CHANNEL, { type }));
contextBridge.exposeInMainWorld('neydraOrbit', Object.freeze<OrbitBridge>({
  async getRole() { return orbitRoleResultSchema.parse(await ipcRenderer.invoke(ORBIT_CHANNEL, { type: 'role' })); },
  ready: () => invoke('ready'), activate: () => invoke('activate'), dismiss: () => invoke('dismiss'),
  async navigate(direction) {
    const parsed = directionSchema.safeParse(direction);
    if (!parsed.success) return { ok: false, code: 'invalid-request' };
    return companionResultSchema.parse(await ipcRenderer.invoke(ORBIT_CHANNEL, { type: 'navigate', direction: parsed.data }));
  },
  onVisibility(listener) {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      const parsed = orbitVisibilitySchema.safeParse(raw); if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(ORBIT_EVENT, handler); return () => ipcRenderer.removeListener(ORBIT_EVENT, handler);
  },
}));
