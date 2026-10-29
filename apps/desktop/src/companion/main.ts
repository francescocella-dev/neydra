import './style.css';
import { bindCompanion } from './controls';
import type { CompanionBridge } from '../shared/companion-contracts';

declare global { interface Window { neydraCompanion: CompanionBridge } }
async function start() {
  const result = await window.neydraCompanion.getMode();
  if (!result.ok) return;
  document.body.dataset.mode = result.mode;
  document.title = result.mode === 'island' ? 'NEYDRA Island' : 'NEYDRA Mini';
  bindCompanion(document.querySelector<HTMLButtonElement>('#companion')!, window.neydraCompanion);
  await window.neydraCompanion.ready();
}
void start().catch(() => { document.querySelector<HTMLButtonElement>('#companion')!.disabled = true; });
