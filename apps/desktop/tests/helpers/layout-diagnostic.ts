import type { Page } from '@playwright/test';

// Fixed selectors and geometry/computed layout only. No text, attributes, URLs or account data.
export async function collectLayoutDiagnostic(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('.mini-shell')!;
    const boundary = shell.getBoundingClientRect();
    const selectors = ['.mini-shell', '.mini-topbar', '.mini-layout', '.avatar-zone', '.conversation-zone',
      '.connected-chat', '.chat-history', '.chat-composer', '.composer-bar', '.consent-label', '.composer-meta',
      '.telemetry-zone', '.status-heading', '.status-heading .icon-control', '.status-heading .control-tooltip', '.status-details'];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      elements: selectors.map(selector => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return { selector, present: false };
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { selector, present: true,
          rect: { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom },
          scroll: { width: element.scrollWidth, height: element.scrollHeight, x: element.scrollLeft, y: element.scrollTop },
          layout: { display: style.display, visibility: style.visibility, position: style.position,
            top: style.top, bottom: style.bottom, left: style.left, right: style.right,
            rows: style.gridTemplateRows, rowGap: style.rowGap, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
            fontSize: style.fontSize, lineHeight: style.lineHeight, overflowX: style.overflowX, overflowY: style.overflowY },
          outsideShell: { top: Math.max(0, boundary.top - box.top), right: Math.max(0, box.right - boundary.right),
            bottom: Math.max(0, box.bottom - boundary.bottom), left: Math.max(0, boundary.left - box.left) },
        };
      }),
    };
  });
}
