import { test, expect, type Page } from '@playwright/test';
import { body } from '../fixtures/synthetic';
import type { Observation } from '../../src/types';
interface TestAPI {
  beginReplay(): void;
  observe(o: Observation): void;
  bump(): void;
  state(): {
    screen: string;
    lane: number;
    duck: boolean;
    height: number;
    score: number;
    hearts: number;
    fps: number;
    input: { lane: number; jump: boolean; duck: boolean };
    stats?: {
      backend: string;
      processed: number;
      inferenceMs: number;
      pipelineMs: number;
      poseHz: number;
    };
  };
}
declare global {
  interface Window {
    __bostikTest: TestAPI;
    __replayInterval: number;
    __body: ReturnType<typeof body>;
    __noPose: boolean;
    __track: MediaStreamTrack;
  }
}
const state = (page: Page) => page.evaluate(() => window.__bostikTest.state());
async function playKeyboard(page: Page) {
  await page.getByRole('button', { name: 'Play with keyboard' }).click();
  await page.getByRole('button', { name: 'Let’s explore' }).click();
  await expect.poll(async () => (await state(page)).screen).toBe('play');
}
test('welcome, keyboard moves, pause, resume, game over/restart and local best', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(
    page.getByRole('heading', { name: 'A little move. A big adventure.' }),
  ).toBeVisible();
  await page.screenshot({ path: '.ai-local/welcome-desktop.png', fullPage: true });
  await playKeyboard(page);
  await page.locator('#world').click();
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await state(page)).lane).toBe(-1);
  await page.keyboard.up('ArrowLeft');
  await expect.poll(async () => (await state(page)).lane).toBe(0);
  await page.keyboard.down('Space');
  await expect.poll(async () => (await state(page)).height).toBeGreaterThan(0.1);
  await page.keyboard.up('Space');
  await expect.poll(async () => (await state(page)).height).toBe(0);
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await state(page)).duck).toBe(true);
  await page.keyboard.up('ArrowDown');
  await page.getByRole('button', { name: 'Pause game' }).click();
  const paused = await state(page);
  await page.waitForTimeout(400);
  expect((await state(page)).score).toBe(paused.score);
  await page.getByRole('button', { name: 'Continue adventure' }).click();
  await expect.poll(async () => (await state(page)).screen).toBe('play');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__bostikTest.bump());
    await page.waitForTimeout(150);
  }
  await expect(page.getByRole('heading', { name: 'Lovely exploring!' })).toBeVisible();
  const best = Number(await page.locator('#best').textContent());
  expect(best).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'One more adventure' }).click();
  await expect.poll(async () => (await state(page)).screen).toBe('play');
  expect((await state(page)).hearts).toBe(3);
  await page.reload();
  expect(Number(await page.locator('#best').textContent())).toBe(best);
  expect(errors).toEqual([]);
});
test('settings persist, mute, resizing, unavailable storage and visibility interruption', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('bostik-v1', '{invalid');
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Parent corner' }).click();
  await page.getByLabel('Hop gesture').selectOption('hands');
  await page.getByLabel('Scene detail').selectOption('low');
  await page.getByLabel('Gentle game sounds').uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Parent corner' }).click();
  await expect(page.getByLabel('Hop gesture')).toHaveValue('hands');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.ai-local/welcome-landscape.png', fullPage: true });
  await playKeyboard(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await state(page)).screen).toBe('paused');
  expect((await state(page)).input.duck).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(Storage.prototype, 'setItem', {
      value: () => {
        throw new Error('Quota');
      },
    });
  });
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saving is unavailable' })).toBeVisible();
});
test('camera denial and absence recover to usable setup and keyboard fallback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Let’s move' }).click();
  await page.getByRole('button', { name: 'Allow camera' }).click();
  await expect(page.locator('#setup-message')).toContainText('blocked');
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Missing', 'NotFoundError');
    };
  });
  await page.getByRole('button', { name: 'Allow camera' }).click();
  await expect(page.locator('#setup-message')).toContainText('No matching camera');
  await page.getByRole('button', { name: 'Use keyboard instead' }).click();
  await expect(page.getByRole('heading', { name: 'A little wiggle first.' })).toBeVisible();
});
test('real locally hosted model processes fake video, stops and reopens without live tracks', async ({
  page,
}) => {
  test.setTimeout(150000);
  const requests: { url: string; method: string }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }));
  await page.goto('./');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Let’s move' }).click();
    await page.getByRole('button', { name: 'Allow camera' }).click();
    await expect(page.getByRole('button', { name: 'I’m standing in the middle' })).toBeVisible({
      timeout: 45000,
    });
    await expect
      .poll(async () => (await state(page)).stats?.processed, { timeout: 45000 })
      .toBeGreaterThan(3);
    const metrics = (await state(page)).stats;
    console.log('REAL MODEL / SYNTHETIC VIDEO pipeline sample:', metrics);
    await page.locator('#camera-video').evaluate((v) => {
      window.__track = ((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0];
    });
    await page.getByRole('button', { name: 'I’m standing in the middle' }).click();
    await expect(page.getByLabel('Camera selection').locator('option')).not.toHaveCount(0);
    await page.getByRole('button', { name: 'Stop camera & return to setup' }).click();
    expect(
      await page.locator('#camera-video').evaluate((v) => (v as HTMLVideoElement).srcObject),
    ).toBeNull();
    expect(await page.evaluate(() => window.__track.readyState)).toBe('ended');
    await expect.poll(() => page.workers().length).toBe(0);
    await page.getByRole('link', { name: 'Bostik Game home' }).click();
  }
  expect(
    requests.every(
      (r) => r.method === 'GET' && r.url.startsWith('http://127.0.0.1:4173/bostik-game/'),
    ),
  ).toBe(true);
});
test('worker failure uses the bounded main-thread model fallback', async ({ page }) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error('Worker unavailable');
      }
    } as unknown as typeof Worker;
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Let’s move' }).click();
  await page.getByRole('button', { name: 'Allow camera' }).click();
  await expect
    .poll(async () => (await state(page)).stats?.processed, { timeout: 45000 })
    .toBeGreaterThan(3);
  expect((await state(page)).stats?.backend).toBe('main-thread');
  await page.getByRole('button', { name: 'Stop camera & return to setup' }).click();
});
test('worker frame failure recovers through the main-thread model without replacing the stream', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(Target, args) {
        const worker = Reflect.construct(Target, args) as Worker;
        const post = worker.postMessage.bind(worker);
        worker.postMessage = ((message: { type?: string }, transfer?: Transferable[]) => {
          if (message.type === 'frame')
            queueMicrotask(() =>
              worker.onmessage?.(
                new MessageEvent('message', {
                  data: { type: 'error', message: 'Injected worker frame failure' },
                }),
              ),
            );
          else post(message, transfer || []);
        }) as Worker['postMessage'];
        return worker;
      },
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Let’s move' }).click();
  await page.getByRole('button', { name: 'Allow camera' }).click();
  await expect
    .poll(async () => (await state(page)).stats?.processed, { timeout: 60000 })
    .toBeGreaterThan(3);
  expect((await state(page)).stats?.backend).toBe('main-thread');
  expect(
    await page
      .locator('#camera-video')
      .evaluate(
        (v) => ((v as HTMLVideoElement).srcObject as MediaStream).getVideoTracks()[0].readyState,
      ),
  ).toBe('live');
  await page.getByRole('button', { name: 'Stop camera & return to setup' }).click();
});
test.describe('asset failures without service-worker cache', () => {
  test.use({ serviceWorkers: 'block' });
  for (const extension of ['wasm', 'task']) {
    test(`missing .${extension} fails usefully and can retry`, async ({ page, context }) => {
      const pattern = new RegExp(`/vision/[^?]+\\.${extension}$`);
      // Context routing covers the dedicated inference worker. Page routing does not.
      await context.route(pattern, (route) =>
        route.fulfill({ status: 404, body: 'Missing test asset' }),
      );
      await page.goto('./');
      await page.getByRole('button', { name: 'Let’s move' }).click();
      await page.getByRole('button', { name: 'Allow camera' }).click();
      await expect(page.locator('#setup-message')).toContainText('could not load', {
        timeout: 55000,
      });
      await context.unroute(pattern);
      await page.getByRole('button', { name: 'Allow camera' }).click();
      await expect(page.getByRole('button', { name: 'I’m standing in the middle' })).toBeVisible({
        timeout: 45000,
      });
    });
  }
});
test('synthetic observations drive calibration, combined moves, loss, ambiguity and stable resume', async ({
  page,
}) => {
  await page.goto('./');
  await page.evaluate((b) => {
    window.__bostikTest.beginReplay();
    window.__body = b;
    window.__noPose = false;
    window.__replayInterval = window.setInterval(
      () =>
        window.__bostikTest.observe({
          timestamp: performance.now(),
          bodies: window.__noPose ? [] : [window.__body],
        }),
      65,
    );
  }, body());
  await expect(page.getByRole('heading', { name: 'A little wiggle first.' })).toBeVisible();
  await page.waitForTimeout(800);
  for (const x of [-0.7, 0.7, 0]) {
    await page.evaluate((b) => {
      window.__body = b;
    }, body({ x }));
    await page.waitForTimeout(400);
  }
  for (const lift of [0.05, 0.12, 0.2, 0.28, 0.28, 0.2, 0]) {
    await page.evaluate(
      (b) => {
        window.__body = b;
      },
      body({ lift, x: 0.7 }),
    );
    await page.waitForTimeout(80);
  }
  await page.evaluate(
    (b) => {
      window.__body = b;
    },
    body({ crouch: 0.4, footLift: 0 }),
  );
  await page.waitForTimeout(300);
  await page.evaluate((b) => {
    window.__body = b;
  }, body());
  await expect(page.getByRole('button', { name: 'Let’s explore' })).toBeEnabled();
  await page.getByRole('button', { name: 'Let’s explore' }).click();
  await expect.poll(async () => (await state(page)).screen).toBe('play');
  await page.evaluate(
    (b) => {
      window.__body = b;
    },
    body({ x: -0.7 }),
  );
  await expect.poll(async () => (await state(page)).lane).toBe(-1);
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).lane).toBe(-1);
  await page.evaluate(() => {
    window.__noPose = true;
  });
  await expect.poll(async () => (await state(page)).screen).toBe('paused');
  await expect(page.getByRole('button', { name: 'Continue adventure' })).toBeDisabled();
  await page.evaluate((b) => {
    window.__body = b;
    window.__noPose = false;
  }, body());
  await expect(page.getByRole('button', { name: 'Continue adventure' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue adventure' }).click();
  await expect.poll(async () => (await state(page)).screen).toBe('play');
  await page.evaluate((b) => {
    clearInterval(window.__replayInterval);
    window.__replayInterval = window.setInterval(
      () => window.__bostikTest.observe({ timestamp: performance.now(), bodies: [b, b] }),
      65,
    );
  }, body());
  await expect.poll(async () => (await state(page)).screen).toBe('paused');
  await expect(page.locator('#tracking-status')).toContainText('One adventurer');
});
test('warm offline installation caches model/WASM and restarts without the network', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await page.goto('./');
  await expect(page.locator('#offline-status')).toContainText('Ready for offline', {
    timeout: 30000,
  });
  const cache = await page.evaluate(async () => {
    const keys = await caches.keys();
    const c = await caches.open(keys.find((k) => k.startsWith('bostik-'))!);
    return (await c.keys()).map((r) => r.url);
  });
  expect(cache.some((u) => u.endsWith('pose_landmarker_lite.task'))).toBe(true);
  expect(cache.filter((u) => u.endsWith('.wasm')).length).toBeGreaterThanOrEqual(2);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'A little move. A big adventure.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Let’s move' }).click();
  await page.getByRole('button', { name: 'Allow camera' }).click();
  await expect(page.getByRole('button', { name: 'I’m standing in the middle' })).toBeVisible({
    timeout: 45000,
  });
  await expect
    .poll(async () => (await state(page)).stats?.processed, { timeout: 45000 })
    .toBeGreaterThan(0);
});
