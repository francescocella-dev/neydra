import { describe, expect, it } from 'vitest';
import { APP_URL, CSP, rendererAsset, rendererPreferences, trustedSender } from '../src/main/security';

describe('desktop trust boundary', () => {
  it('requires a sandboxed, isolated renderer without Node or webview', () => {
    expect(rendererPreferences).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, webSecurity: true });
  });
  it('accepts only its own main frame', () => {
    expect(trustedSender(1, 1, APP_URL, true)).toBe(true);
    expect(trustedSender(2, 1, APP_URL, true)).toBe(false);
    expect(trustedSender(1, 1, 'https://example.org', true)).toBe(false);
    expect(trustedSender(1, 1, APP_URL, false)).toBe(false);
    expect(trustedSender(1, 1, APP_URL + '?evil', true)).toBe(false);
  });
  it('serves only generated local files', () => {
    expect(rendererAsset(APP_URL)).toBe('index.html');
    expect(rendererAsset('app://desktop/assets/index-A1_b.js')).toBe('assets/index-A1_b.js');
    for (const url of ['file:///etc/passwd', 'https://example.org', 'app://desktop/secret.json',
      'app://desktop/assets/%2e%2e/secret.js', 'app://desktop/assets/a.js?x=1',
      'app://other/index.html', 'app://user@desktop/index.html', 'app://desktop/assets/a.js.map']) {
      expect(rendererAsset(url)).toBeUndefined();
    }
  });
  it('denies remote connections, inline scripts and frames through CSP', () => {
    expect(CSP).toContain("connect-src 'none'");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });
});
