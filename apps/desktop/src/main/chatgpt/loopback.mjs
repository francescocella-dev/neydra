// Adapted from PR #6, 4cd91e9 (MIT). Loopback only.
import { createServer } from 'node:http';
import { Stop, consumeCallback, transaction } from './protocol.mjs';

export async function listen(hostId, clientId, timeoutMs = 180_000) {
  let tx;
  let settle;
  let settled = false;
  const result = new Promise(resolve => { settle = resolve; });
  const server = createServer((req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    if (!tx || req.method !== 'GET' || req.headers.host !== new URL(tx.redirectUri).host ||
        req.headers.origin || !req.url?.startsWith('/auth/callback?') || req.url.length > 8192) {
      res.writeHead(400).end('Richiesta non valida.');
      return;
    }
    if (settled) { res.writeHead(409).end('Tentativo terminato.'); return; }
    try {
      const callback = consumeCallback(tx, new URL(req.url, tx.redirectUri));
      res.end('Autorizzazione ricevuta. Torna a NEYDRA per la verifica.');
      finish({ callback });
    } catch (error) {
      res.writeHead(400).end('Autorizzazione interrotta. Torna a NEYDRA.');
      finish({ error });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 4;
  const finish = value => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
    // Let the final browser response flush before closing any slow connections.
    setTimeout(() => server.closeAllConnections(), 1000).unref();
    settle(value);
  };
  let timer;
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(new Stop('loopback_unavailable')));
    server.listen(0, '127.0.0.1', resolve);
  });
  tx = transaction(`http://127.0.0.1:${server.address().port}/auth/callback`, hostId, clientId);
  timer = setTimeout(() => finish({ error: new Stop('consent_timeout') }), timeoutMs);
  return { tx, result, close: () => finish({ error: new Stop('cancelled') }) };
}
