import { contextBridge, ipcRenderer } from 'electron';
import { COMPANION_CHANNEL, COMPANION_MENU_EVENT, companionMenuSchema, companionResultSchema, menuInputSchema, menuDirectionSchema, type CompanionBridge } from '../shared/companion-contracts';

const invoke = async (type: string) => companionResultSchema.parse(await ipcRenderer.invoke(COMPANION_CHANNEL, { type }));
contextBridge.exposeInMainWorld('neydraCompanion', Object.freeze<CompanionBridge>({
  ready: () => invoke('ready'),
  restore: () => invoke('restore'), beginDrag: () => invoke('dragStart'), moveDrag: () => invoke('dragMove'),
  endDrag: () => invoke('dragEnd'), cancelDrag: () => invoke('dragCancel'),
  async openMenu(input = { keyboard: false }) {
    const parsed = menuInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: 'invalid-request' };
    return companionResultSchema.parse(await ipcRenderer.invoke(COMPANION_CHANNEL, { type: 'menu', input: parsed.data }));
  },
  closeMenu: () => invoke('dismissMenu'),
  async navigateMenu(direction) {
    const parsed = menuDirectionSchema.safeParse(direction);
    if (!parsed.success) return { ok: false, code: 'invalid-request' };
    return companionResultSchema.parse(await ipcRenderer.invoke(COMPANION_CHANNEL, { type: 'navigateMenu', direction: parsed.data }));
  },
  onMenuState(listener) {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      const parsed = companionMenuSchema.safeParse(raw); if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(COMPANION_MENU_EVENT, handler);
    return () => ipcRenderer.removeListener(COMPANION_MENU_EVENT, handler);
  },
}));
