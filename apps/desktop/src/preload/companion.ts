import { contextBridge, ipcRenderer } from 'electron';
import { COMPANION_CHANNEL, companionResultSchema, type CompanionBridge } from '../shared/companion-contracts';

const invoke = async (type: string) => companionResultSchema.parse(await ipcRenderer.invoke(COMPANION_CHANNEL, { type }));
contextBridge.exposeInMainWorld('neydraCompanion', Object.freeze<CompanionBridge>({
  ready: () => invoke('ready'),
  restore: () => invoke('restore'), beginDrag: () => invoke('dragStart'), moveDrag: () => invoke('dragMove'),
  endDrag: () => invoke('dragEnd'), cancelDrag: () => invoke('dragCancel'), openMenu: () => invoke('menu'),
}));
