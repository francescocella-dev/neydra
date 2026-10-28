import './style.css';
import { bindOrbit } from './controls';
import type { OrbitBridge } from '../shared/orbit-contracts';

declare global { interface Window { neydraOrbit: OrbitBridge } }
async function start() {
  const role = await window.neydraOrbit.getRole();
  if (!role.ok) return;
  const button = document.querySelector<HTMLButtonElement>('#action')!;
  bindOrbit(button, window.neydraOrbit, role.role);
  window.addEventListener('focus', () => { if (!button.disabled) button.focus(); });
  await window.neydraOrbit.ready();
}
void start().catch(() => {});
