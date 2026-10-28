import { expect, type Page } from '@playwright/test';

// Geometry only: never capture user text, model responses, account data or URLs.
export async function assertSingleViewport(page: Page, menuOpen = false) {
  const geometry = await page.evaluate(open => {
    const within = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return { present: false, inside: false, hit: false };
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { present: true, inside: box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1,
        hit: hit === element || element.contains(hit) };
    };
    const roots = [document.documentElement, document.body, document.getElementById('root')!, document.querySelector<HTMLElement>('.mini-shell')!];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      roots: roots.map(element => ({ width: element.clientWidth, height: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft })),
      controls: open ? { close: within('#mini-settings button[aria-label="Chiudi menu"]') }
        : { prompt: within('#chat-prompt'), submit: within('.composer-bar .icon-control:last-child button'), consent: within('.consent-label input'), menu: within('#control-menu-button') },
      readables: open ? [] : ['.composer-bar', '.consent-label', '.composer-meta'].map(selector => within(selector).inside),
    };
  }, menuOpen);
  expect(geometry.roots.every(root => root.scrollWidth <= root.width + 1 && root.scrollHeight <= root.height + 1 && root.scrollTop === 0 && root.scrollLeft === 0), JSON.stringify(geometry)).toBe(true);
  for (const control of Object.values(geometry.controls)) expect(control, JSON.stringify(geometry)).toEqual({ present: true, inside: true, hit: true });
  expect(geometry.readables.every(Boolean), JSON.stringify(geometry)).toBe(true);
}
