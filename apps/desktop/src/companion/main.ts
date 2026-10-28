import './style.css';
import { bindCompanion } from './controls';
import type { CompanionBridge } from '../shared/companion-contracts';

declare global { interface Window { neydraCompanion: CompanionBridge } }
bindCompanion(document.querySelector<HTMLButtonElement>('#companion')!, window.neydraCompanion);
void window.neydraCompanion.ready().catch(() => {});
