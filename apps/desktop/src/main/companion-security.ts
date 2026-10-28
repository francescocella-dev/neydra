export const COMPANION_URL = 'app://companion/index.html';
export function companionAsset(url: string): string | undefined {
  const parsed = new URL(url);
  if (parsed.protocol !== 'app:' || parsed.host !== 'companion' || parsed.username || parsed.password || parsed.search || parsed.hash) return;
  if (parsed.pathname === '/index.html') return 'index.html';
  if (/^\/assets\/[A-Za-z0-9_-]+\.(js|css|woff2)$/.test(parsed.pathname)) return parsed.pathname.slice(1);
}
export function trustedCompanion(senderId: number, expectedId: number | undefined, url?: string, mainFrame = false) {
  return senderId === expectedId && url === COMPANION_URL && mainFrame;
}
