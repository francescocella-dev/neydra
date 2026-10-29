export const COMPANION_URL = 'app://companion/index.html';
export const ORBIT_URL = 'app://orbit/index.html';
function localAsset(url: string, host: string): string | undefined {
  const parsed = new URL(url);
  if (parsed.protocol !== 'app:' || parsed.host !== host || parsed.username || parsed.password || parsed.search || parsed.hash) return;
  if (parsed.pathname === '/index.html') return 'index.html';
  if (/^\/assets\/[A-Za-z0-9_-]+\.(js|css|woff2)$/.test(parsed.pathname)) return parsed.pathname.slice(1);
}
export const companionAsset = (url: string) => localAsset(url, 'companion');
export const orbitAsset = (url: string) => localAsset(url, 'orbit');
export function trustedCompanion(senderId: number, expectedId: number | undefined, url?: string, mainFrame = false) {
  return senderId === expectedId && url === COMPANION_URL && mainFrame;
}
export function trustedOrbit(senderId: number, expectedId: number, url?: string, mainFrame = false) {
  return senderId === expectedId && url === ORBIT_URL && mainFrame;
}
