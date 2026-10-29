import { describe, expect, it, vi } from 'vitest';
import { CompanionController, companionCommand, reachablePosition, type Rect } from '../src/main/companion-controller';
import { companionAsset, COMPANION_URL, trustedCompanion } from '../src/main/companion-security';
import { APP_URL, rendererAsset, trustedSender } from '../src/main/security';

function windowFixture(bounds: Rect, visible = true) {
  let position = { ...bounds }, shown = visible, destroyed = false;
  return {
    isDestroyed: vi.fn(() => destroyed), isVisible: vi.fn(() => shown), isMinimized: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false), setFullScreen: vi.fn(), restore: vi.fn(),
    show: vi.fn(() => { shown = true; }), hide: vi.fn(() => { shown = false; }), focus: vi.fn(),
    getBounds: vi.fn(() => ({ ...position })),
    setPosition: vi.fn((x: number, y: number) => { position = { ...position, x, y }; }),
    destroy: vi.fn(() => { destroyed = true; shown = false; }),
  };
}
function fixture() {
  const main = windowFixture({ x: 100, y: 100, width: 1280, height: 860 });
  const floating = windowFixture({ x: 1200, y: 800, width: 120, height: 120 }, false);
  let cursor = { x: 100, y: 100 };
  let areas = [{ x: 0, y: 0, width: 1920, height: 1040 }];
  const create = vi.fn(async () => floating), quit = vi.fn();
  const controller = new CompanionController(main, create, () => areas, () => cursor, quit);
  return { controller, main, floating, create, quit,
    cursor(point: typeof cursor) { cursor = point; }, areas(next: Rect[]) { areas = next; } };
}

it('keeps main alive; shows and focuses a single loaded companion before hiding main; restores it without reload', async () => {
  const f = fixture();
  expect(await f.controller.reduce()).toEqual({ ok: true });
  expect(f.floating.show.mock.invocationCallOrder[0]).toBeLessThan(f.main.hide.mock.invocationCallOrder[0]!);
  expect(f.floating.focus).toHaveBeenCalledOnce();
  expect(f.main.isVisible()).toBe(false); expect(f.main.destroy).not.toHaveBeenCalled();
  await f.controller.reduce(); expect(f.create).toHaveBeenCalledOnce();
  expect(f.controller.restore()).toEqual({ ok: true });
  expect(f.main.isVisible()).toBe(true); expect(f.main.focus).toHaveBeenCalled(); expect(f.floating.isVisible()).toBe(false);
  await f.controller.reduce(); expect(f.create).toHaveBeenCalledOnce();
});
it('serializes concurrent reductions and cancels a late creation on restore or quit', async () => {
  for (const action of ['restore', 'dispose'] as const) {
    const f = fixture();
    let finish!: (value: typeof f.floating) => void;
    f.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.controller.reduce();
    expect(f.main.isVisible()).toBe(true);
    expect(await f.controller.reduce()).toEqual({ ok: false, code: 'busy' });
    f.controller[action](); finish(f.floating);
    expect(await pending).toEqual({ ok: false, code: 'unavailable' });
    expect(f.main.hide).not.toHaveBeenCalled(); expect(f.floating.destroy).toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledOnce();
  }
});
it('recovers main on factory/show failure, unexpected close/hide/crash, and quits if no usable main remains', async () => {
  const failed = fixture(); failed.create.mockRejectedValueOnce(new Error('synthetic'));
  expect(await failed.controller.reduce()).toEqual({ ok: false, code: 'unavailable' });
  expect(failed.main.isVisible()).toBe(true); expect(failed.main.hide).not.toHaveBeenCalled();
  const invisible = fixture(); invisible.floating.show.mockImplementationOnce(() => {});
  expect(await invisible.controller.reduce()).toEqual({ ok: false, code: 'unavailable' });
  expect(invisible.main.isVisible()).toBe(true);
  const f = fixture(); await f.controller.reduce(); f.floating.destroy(); f.controller.recover();
  expect(f.main.isVisible()).toBe(true); expect(f.main.focus).toHaveBeenCalled();
  await f.controller.reduce(); // A destroyed factory result is rejected, not used to hide main.
  expect(f.main.isVisible()).toBe(true);
  const orphan = fixture(); await orphan.controller.reduce(); orphan.main.destroy(); orphan.controller.recover();
  expect(orphan.quit).toHaveBeenCalledOnce();
});
it('distinguishes a click/jitter from a drag, keeps drag sticky on return to origin and cancels without opening', async () => {
  const f = fixture(); await f.controller.reduce();
  f.controller.beginDrag(); f.cursor({ x: 102, y: 101 }); f.controller.moveDrag(); f.controller.endDrag();
  expect(f.main.isVisible()).toBe(true);
  await f.controller.reduce();
  f.controller.beginDrag(); f.cursor({ x: 122, y: 121 }); f.controller.moveDrag();
  expect(f.floating.getBounds()).toMatchObject({ x: 1220, y: 820 });
  f.cursor({ x: 102, y: 101 }); f.controller.moveDrag(); f.controller.endDrag();
  expect(f.main.isVisible()).toBe(false);
  f.controller.beginDrag(); f.controller.cancelDrag();
  expect(f.controller.endDrag()).toEqual({ ok: false, code: 'unavailable' });
  expect(f.main.isVisible()).toBe(false);
  f.controller.beginDrag(); f.cursor({ x: 202, y: 201 }); f.controller.endDrag();
  expect(f.floating.getBounds()).toMatchObject({ x: 1300, y: 900 }); // Final point needs no intermediate move.
});
it('clamps dragging to real work areas and rehomes on display removal/DPI/taskbar changes, including negative monitors', async () => {
  const f = fixture();
  f.areas([{ x: -1280, y: -100, width: 1280, height: 960 }, { x: 0, y: 0, width: 1920, height: 1040 }]);
  await f.controller.reduce(); f.controller.beginDrag(); f.cursor({ x: -3000, y: -2000 }); f.controller.moveDrag();
  expect(f.floating.getBounds()).toMatchObject({ x: -1280, y: -100 });
  f.controller.endDrag(); expect(f.main.isVisible()).toBe(false);
  f.areas([{ x: 0, y: 0, width: 1024, height: 688 }]); f.controller.displaysChanged();
  expect(f.floating.getBounds()).toMatchObject({ x: 0, y: 0 });
  f.floating.setPosition(950, 650); f.controller.displaysChanged();
  expect(f.floating.getBounds()).toMatchObject({ x: 904, y: 568 });
  f.areas([]); f.controller.displaysChanged(); expect(f.main.isVisible()).toBe(true);
});
it('never places the circle in monitor gaps or an area too small; restores a minimized/offscreen main and preserves fullscreen', async () => {
  const bounds = { x: 600, y: 300, width: 120, height: 120 };
  expect(reachablePosition(bounds, [{ x: 0, y: 0, width: 400, height: 500 }, { x: 1000, y: 0, width: 800, height: 600 }])).toEqual({ x: 280, y: 300 });
  expect(reachablePosition(bounds, [{ x: 0, y: 0, width: 100, height: 100 }])).toBeUndefined();
  const f = fixture(); await f.controller.reduce(); f.main.setPosition(-5000, -5000);
  f.main.isMinimized.mockReturnValue(true); f.controller.restore();
  expect(f.main.restore).toHaveBeenCalledOnce(); expect(f.main.getBounds()).toMatchObject({ x: 0, y: 0 });
  await f.controller.reduce(); f.main.isFullScreen.mockReturnValue(true); f.main.setPosition.mockClear(); f.controller.restore();
  expect(f.main.setPosition).not.toHaveBeenCalled();
  await f.controller.reduce(); f.main.isFullScreen.mockReturnValue(false); f.main.isMaximized.mockReturnValue(true);
  f.controller.restore(); expect(f.main.setPosition).not.toHaveBeenCalled();
  f.controller.dispose(); expect(f.floating.isDestroyed()).toBe(true);
  expect(await f.controller.reduce()).toEqual({ ok: false, code: 'unavailable' });
  f.main.show.mockClear(); f.controller.recover(); expect(f.main.show).not.toHaveBeenCalled();
});

describe('separate companion trust boundary', () => {
  it('only accepts its own exact origin and main frame; neither origin gains the other bridge', () => {
    expect(trustedCompanion(2, 2, COMPANION_URL, true)).toBe(true);
    for (const [id, expected, url, frame] of [[1, 2, COMPANION_URL, true], [2, 2, APP_URL, true], [2, 2, COMPANION_URL, false], [2, 2, COMPANION_URL + '?x', true]] as const) {
      expect(trustedCompanion(id, expected, url, frame)).toBe(false);
    }
    expect(trustedSender(2, 1, COMPANION_URL, true)).toBe(false);
    expect(rendererAsset(COMPANION_URL)).toBeUndefined(); expect(companionAsset(APP_URL)).toBeUndefined();
    expect(companionAsset(COMPANION_URL)).toBe('index.html');
    expect(companionAsset('app://companion/assets/index-123.css')).toBe('assets/index-123.css');
    for (const url of ['file:///fixture', 'https://example.org', 'app://user@companion/index.html', 'app://companion/index.html#x',
      'app://companion/assets/a.js?x', 'app://companion/assets/a.js.map', 'app://companion/secret.json', 'app://companion/assets/%2e%2e/secret.js']) {
      expect(companionAsset(url)).toBeUndefined();
    }
  });
  it('rejects generic movement, account/data commands, extra fields, subframes and cross-window commands', async () => {
    const f = fixture(), menu = vi.fn();
    expect(await companionCommand({ type: 'reduce' }, undefined, f.controller, menu)).toMatchObject({ code: 'untrusted-sender' });
    for (const payload of [null, { type: 'startChatGPT' }, { type: 'dragMove', x: 9999 }, { type: 'menu', url: 'https://example.org' }, { type: 'restore', token: 'synthetic' }]) {
      expect(await companionCommand(payload, 'companion', f.controller, menu)).toMatchObject({ code: 'invalid-request' });
    }
    expect(await companionCommand({ type: 'reduce' }, 'companion', f.controller, menu)).toMatchObject({ code: 'untrusted-sender' });
    expect(await companionCommand({ type: 'restore' }, 'main', f.controller, menu)).toMatchObject({ code: 'untrusted-sender' });
    expect(f.create).not.toHaveBeenCalled(); expect(menu).not.toHaveBeenCalled();
    expect(await companionCommand({ type: 'reduce' }, 'main', f.controller, menu)).toEqual({ ok: true });
    expect(await companionCommand({ type: 'menu', input: { keyboard: false } }, 'companion', f.controller, menu)).toEqual({ ok: true }); expect(menu).toHaveBeenCalledOnce();
    expect(await companionCommand({ type: 'restore' }, 'companion', f.controller, menu)).toEqual({ ok: true });
  });
});

it('restores native fullscreen if the OS left it while hidden, without applying normal-window coordinates', async () => {
  const f = fixture(); f.main.isFullScreen.mockReturnValue(true); await f.controller.reduce();
  f.main.isFullScreen.mockReturnValue(false); f.controller.restore();
  expect(f.main.setFullScreen).toHaveBeenCalledExactlyOnceWith(true); expect(f.main.setPosition).not.toHaveBeenCalled();
});

it('detaches a closing but still native-live companion before recovery and ignores reentrant restores', async () => {
  const f = fixture(); await f.controller.reduce();
  f.floating.hide.mockImplementation(() => { throw new Error('must not hide the closing shell'); });
  f.main.show.mockClear(); f.main.focus.mockClear();
  f.main.show.mockImplementationOnce(() => { f.controller.recover(); f.controller.restore(); });
  f.main.isVisible.mockReturnValue(true);
  expect(() => f.controller.recover(f.floating)).not.toThrow();
  expect(f.main.focus).toHaveBeenCalledOnce(); expect(f.floating.hide).not.toHaveBeenCalled(); expect(f.quit).not.toHaveBeenCalled();
  f.controller.recover(f.floating); expect(f.main.focus).toHaveBeenCalledOnce();
});
it('restores main despite an overlay callback failure, then reports the genuine error', async () => {
  const f = fixture(), notification = vi.fn();
  const controller = new CompanionController(f.main, f.create, () => [{ x: 0, y: 0, width: 1920, height: 1040 }],
    () => ({ x: 0, y: 0 }), f.quit, notification);
  await controller.reduce();
  notification.mockImplementationOnce(() => { throw new Error('synthetic overlay failure'); });
  expect(() => controller.recover(f.floating)).toThrow('synthetic overlay failure');
  expect(f.main.isVisible()).toBe(true); expect(f.main.focus).toHaveBeenCalledOnce(); expect(f.quit).not.toHaveBeenCalled();
  controller.dispose(); controller.dispose(); controller.recover(f.floating);
  expect(f.main.focus).toHaveBeenCalledOnce();
});
