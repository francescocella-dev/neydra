export const APP_URL = 'app://desktop/index.html';
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'none'";
export const rendererPreferences = {
  contextIsolation: true, sandbox: true, nodeIntegration: false,
  webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
} as const;

// Generated Vite files only; no arbitrary filesystem mapping or extension handlers.
export function rendererAsset(url: string): string | undefined {
  const parsed = new URL(url);
  if (parsed.protocol !== 'app:' || parsed.host !== 'desktop' || parsed.username || parsed.password || parsed.search || parsed.hash) return;
  if (parsed.pathname === '/index.html') return 'index.html';
  if (/^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(parsed.pathname)) return parsed.pathname.slice(1);
}

export function trustedSender(senderId: number, expectedId: number, frameUrl?: string, isMainFrame = false) {
  return senderId === expectedId && frameUrl === APP_URL && isMainFrame;
}
