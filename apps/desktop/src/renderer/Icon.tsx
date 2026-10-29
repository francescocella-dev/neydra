import { useId, type ButtonHTMLAttributes } from 'react';

export type IconName = 'mini' | 'menu' | 'close' | 'chat' | 'status' | 'theme' | 'settings' | 'info' | 'expand' | 'collapse' | 'mic' | 'send' | 'stop' | 'connection';
const paths: Record<IconName, string[]> = {
  mini: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M9 16V8l6 8V8'],
  menu: ['M4 6h16M4 12h16M4 18h16'], close: ['M6 6l12 12M18 6 6 18'],
  chat: ['M4 4h16v12H9l-5 4V4'], status: ['M4 18V9M12 18V4M20 18v-6'],
  theme: ['M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  settings: ['M4 7h16M4 17h16M8 4v6M16 14v6'], info: ['M12 11v6M12 7h.01', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  expand: ['M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'],
  collapse: ['M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5'],
  mic: ['M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5', 'M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8'],
  send: ['M12 19V5M6 11l6-6 6 6'], stop: ['M6 6h12v12H6z'],
  connection: ['M9 8V4M15 8V4M7 8h10v4a5 5 0 0 1-10 0V8M12 17v4'],
};
export function Icon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name].map((d, index) => <path key={index} d={d} />)}</svg>;
}
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { icon: IconName; label: string; hint?: string }
export function IconButton({ icon, label, hint, className = '', ...props }: IconButtonProps) {
  const tooltipId = useId();
  return <span className="icon-control"><button {...props} type={props.type ?? 'button'} className={`icon-button ${className}`} aria-label={label} aria-describedby={tooltipId}><Icon name={icon} /></button><span id={tooltipId} className="control-tooltip" role="tooltip">{hint || label}</span></span>;
}
