import { net, session } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CSP } from './security';

// Same deny-by-default policy for both in-memory sessions. No shared account storage.
export function rendererSession(partition: string, directory: string, assetFor: (url: string) => string | undefined) {
  const isolated = session.fromPartition(partition);
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.setDevicePermissionHandler(() => false);
  isolated.on('will-download', event => event.preventDefault());
  isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !assetFor(details.url) }));
  isolated.protocol.handle('app', async request => {
    const asset = assetFor(request.url);
    if (!asset || request.method !== 'GET') return new Response(null, { status: 403 });
    try {
      const response = await net.fetch(pathToFileURL(join(directory, asset)).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', CSP);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    } catch { return new Response(null, { status: 404 }); }
  });
  return isolated;
}
