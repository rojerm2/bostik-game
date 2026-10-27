import { test, expect, type Page } from '@playwright/test';
import { body } from '../fixtures/synthetic';
import type { Observation } from '../../src/types';
interface TestAPI {
  beginReplay(): void;
  observe(o: Observation): void;
  bump(clearProtection?: boolean): void;
  state(): {
    screen: string;
    lane: number;
    duck: boolean;
    height: number;
    score: number;
    speed: number;
    difficulty: string;
    distance: number;
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
    __ambiguous: boolean;
    __track: MediaStreamTrack;
  }
}
const state = (page: Page) => page.evaluate(() => window.__bostikTest.state());
async function playKeyboard(page: Page, controlledClock = false) {
  await page.getByRole('button', { name: 'Play with keyboard' }).click();
  await page.getByRole('button', { name: 'Let’s explore' }).click();
  if (controlledClock) await page.clock.runFor(3800);
  await expect.poll(async () => (await state(page)).screen).toBe('play');
}
test('welcome, keyboard moves, pause, resume, game over/restart and local best', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-26T00:00:00Z') });
  await page.goto('./');
  await expect(
    page.getByRole('heading', { name: 'A little move. A big adventure.' }),
  ).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-26T01:00:00Z'));
  await page.screenshot({ path: '.ai-local/welcome-desktop.png', fullPage: true });
  await playKeyboard(page, true);
  await page.locator('#world').click();
  await page.keyboard.down('ArrowLeft');
  await page.clock.runFor(100);
  await expect.poll(async () => (await state(page)).lane).toBe(-1);
  await page.keyboard.up('ArrowLeft');
  await page.clock.runFor(100);
  await expect.poll(async () => (await state(page)).lane).toBe(0);
  await page.keyboard.down('Space');
  await page.clock.runFor(150);
  await expect.poll(async () => (await state(page)).height).toBeGreaterThan(0.1);
  await page.keyboard.up('Space');
  await page.clock.runFor(1000);
  await expect.poll(async () => (await state(page)).height).toBe(0);
  await page.keyboard.down('ArrowDown');
  await page.clock.runFor(50);
  await expect.poll(async () => (await state(page)).duck).toBe(true);
  await page.keyboard.up('ArrowDown');
  await page.getByRole('button', { name: 'Pause game' }).click();
  const paused = await state(page);
  await page.clock.runFor(400);
  expect((await state(page)).score).toBe(paused.score);
  await page.evaluate(() => window.__bostikTest.bump(false));
  await page.getByRole('button', { name: 'Continue adventure' }).click();
  await page.clock.runFor(3800);
  await expect.poll(async () => (await state(page)).screen).toBe('play');
  await expect.poll(async () => (await state(page)).score).toBeGreaterThan(paused.score);
  expect((await state(page)).hearts).toBe(3);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__bostikTest.bump());
    await page.clock.runFor(150);
  }
  await expect(page.getByRole('heading', { name: 'Lovely exploring!' })).toBeVisible();
  const best = Number(await page.locator('#best').textContent());
  expect(best).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'One more adventure' }).click();
  await page.clock.runFor(3800);
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
test('a persisted page restore recreates the game and working keyboard controls', async ({
  page,
}) => {
  await page.goto('./');
  await playKeyboard(page);
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    }),
  ]);
  await expect(
    page.getByRole('heading', { name: 'A little move. A big adventure.' }),
  ).toBeVisible();
  expect((await state(page)).screen).toBe('home');
  await expect(page.locator('#world canvas')).toHaveCount(1);
  await playKeyboard(page);
  await page.keyboard.press('KeyP');
  await expect.poll(async () => (await state(page)).screen).toBe('paused');
  await page.goto('about:blank');
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'A little move. A big adventure.' }),
  ).toBeVisible();
  await expect(page.locator('#world canvas')).toHaveCount(1);
});
test('a synthetic widescreen camera keeps video and pose overlay aligned', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const stream = canvas.captureStream(24);
      canvas.getContext('2d')!.fillRect(0, 0, 640, 360);
      window.__track = stream.getVideoTracks()[0];
      return stream;
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Let’s move' }).click();
  await page.getByRole('button', { name: 'Allow camera' }).click();
  await expect(page.locator('#camera-preview')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('#camera-video')
        .evaluate((v) => (v as HTMLVideoElement).videoWidth / (v as HTMLVideoElement).videoHeight),
    )
    .toBeCloseTo(16 / 9);
  const bounds = await page.locator('.video-wrap').boundingBox();
  const overlay = await page.locator('#pose-overlay').boundingBox();
  expect(bounds!.width / bounds!.height).toBeCloseTo(16 / 9, 2);
  expect(overlay!.width).toBeCloseTo(bounds!.width);
  expect(overlay!.height).toBeCloseTo(bounds!.height);
  await page.getByRole('button', { name: 'Stop camera & return to setup' }).click();
  expect(await page.evaluate(() => window.__track.readyState)).toBe('ended');
  await expect.poll(() => page.workers().length).toBe(0);
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
    await expect(page.getByRole('button', { name: 'Start calibration' })).toBeVisible({
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
    await page.getByRole('button', { name: 'Start calibration' }).click();
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
      await expect(page.getByRole('button', { name: 'Start calibration' })).toBeVisible({
        timeout: 45000,
      });
    });
  }
});
async function replayPose(page: Page, pose = body(), duration = 400) {
  await page.evaluate((b) => {
    window.__body = b;
  }, pose);
  await page.clock.runFor(duration);
}
async function cameraTutorial(page: Page, autoplay = true) {
  if (!autoplay)
    await page.addInitScript(() => {
      localStorage.setItem('bostik-v1', JSON.stringify({ settings: { cameraAutoplay: false } }));
    });
  await page.clock.install({ time: new Date('2026-10-27T00:00:00Z') });
  await page.goto('./');
  await page.clock.pauseAt(new Date('2026-10-27T01:00:00Z'));
  await page.evaluate((b) => {
    window.__bostikTest.beginReplay();
    window.__body = b;
    window.__noPose = false;
    window.__ambiguous = false;
    window.__replayInterval = window.setInterval(
      () =>
        window.__bostikTest.observe({
          timestamp: performance.now(),
          bodies: window.__noPose
            ? []
            : window.__ambiguous
              ? [window.__body, window.__body]
              : [window.__body],
        }),
      65,
    );
  }, body());
  await page.clock.runFor(2300);
  await expect(page.getByRole('heading', { name: 'A little wiggle first.' })).toBeVisible();
  for (const x of [-0.7, 0.7, 0]) await replayPose(page, body({ x }));
  for (const lift of [0.05, 0.12, 0.2, 0.28, 0.28, 0.2, 0])
    await replayPose(page, body({ lift, x: 0.7 }), 80);
  await replayPose(page, body({ crouch: 0.4, footLift: 0 }), 330);
  await replayPose(page, body(), 100);
}

test('manual camera start and resume wait for the player to return, including a frozen stream', async ({
  page,
}) => {
  test.setTimeout(180000);
  await cameraTutorial(page, false);
  await expect(page.getByRole('button', { name: 'Let’s explore' })).toBeEnabled();
  await page.evaluate(() => {
    window.__noPose = true;
  });
  await page.getByRole('button', { name: 'Let’s explore' }).click();
  await page.clock.runFor(6000);
  expect((await state(page)).screen).toBe('countdown');
  await expect(page.locator('#countdown-number')).toHaveText('Find your spot');
  expect((await state(page)).score).toBe(0);
  await page.evaluate(() => {
    window.__noPose = false;
  });
  await page.clock.runFor(4200);
  expect((await state(page)).screen).toBe('play');
  await replayPose(page, body({ x: -0.7 }));
  expect((await state(page)).lane).toBe(-1);
  await page.keyboard.press('ArrowRight');
  expect((await state(page)).lane).toBe(-1);
  await page.evaluate(() => {
    window.__noPose = true;
  });
  await page.clock.runFor(800);
  expect((await state(page)).screen).toBe('paused');
  const frozen = (await state(page)).score;
  await expect(page.getByRole('button', { name: 'Resume when visible' })).toBeEnabled();
  await page.getByRole('button', { name: 'Resume when visible' }).click();
  await page.clock.runFor(6000);
  expect((await state(page)).screen).toBe('countdown');
  expect((await state(page)).score).toBe(frozen);
  await page.evaluate((b) => {
    window.__body = b;
    window.__noPose = false;
  }, body());
  await page.clock.runFor(4200);
  expect((await state(page)).screen).toBe('play');
  // No observations at all must expire tracking too.
  await page.evaluate(() => clearInterval(window.__replayInterval));
  await page.clock.runFor(800);
  expect((await state(page)).screen).toBe('paused');
  await expect(page.locator('#tracking-status')).toContainText('Stand tall');
  await page.getByRole('button', { name: 'Resume when visible' }).click();
  await page.clock.runFor(5000);
  expect((await state(page)).screen).toBe('countdown');
  await page.evaluate((b) => {
    window.__body = b;
    window.__replayInterval = window.setInterval(
      () =>
        window.__bostikTest.observe({
          timestamp: performance.now(),
          bodies: window.__ambiguous ? [b, b] : [b],
        }),
      65,
    );
  }, body());
  await page.clock.runFor(4200);
  expect((await state(page)).screen).toBe('play');
  await page.evaluate(() => {
    window.__ambiguous = true;
  });
  await page.clock.runFor(800);
  expect((await state(page)).screen).toBe('paused');
  await expect(page.locator('#tracking-status')).toContainText('One adventurer');
});

test('camera autoplay waits for visibility, resets interrupted countdowns and resumes tracking pauses', async ({
  page,
}) => {
  test.setTimeout(180000);
  await cameraTutorial(page);
  expect((await state(page)).screen).toBe('countdown');
  // Leaving during the countdown resets it instead of starting an empty-camera run.
  await page.evaluate(() => {
    window.__noPose = true;
  });
  await page.clock.runFor(6000);
  await expect(page.locator('#countdown-number')).toHaveText('Find your spot');
  expect((await state(page)).score).toBe(0);
  await page.screenshot({ path: '.ai-local/camera-waiting.png', fullPage: true });
  await page.getByRole('button', { name: 'Stop autoplay & pause', exact: true }).click();
  await page.clock.runFor(5000);
  expect((await state(page)).screen).toBe('paused');
  expect((await state(page)).score).toBe(0);
  await page.getByRole('button', { name: 'Enable autoplay' }).click();
  await page.evaluate(() => {
    window.__noPose = false;
  });
  await page.clock.runFor(1800);
  expect((await state(page)).screen).toBe('countdown');
  await page.evaluate(() => {
    window.__ambiguous = true;
  });
  await page.clock.runFor(5000);
  await expect(page.locator('#countdown-number')).toHaveText('Find your spot');
  await page.evaluate(() => {
    window.__ambiguous = false;
  });
  await page.clock.runFor(4800);
  expect((await state(page)).screen).toBe('play');
  await page.evaluate(() => {
    window.__noPose = true;
  });
  await page.clock.runFor(800);
  expect((await state(page)).screen).toBe('paused');
  const paused = (await state(page)).score;
  await page.clock.runFor(4000);
  expect((await state(page)).score).toBe(paused);
  await page.evaluate(() => {
    window.__noPose = false;
  });
  await page.clock.runFor(4800);
  expect((await state(page)).screen).toBe('play');
});

test('Stop autoplay, manual pause and backgrounding prevent automatic restart', async ({
  page,
}) => {
  test.setTimeout(180000);
  await cameraTutorial(page);
  await page.clock.runFor(4800);
  expect((await state(page)).screen).toBe('play');
  await page.getByRole('button', { name: 'Stop autoplay', exact: true }).click();
  expect((await state(page)).screen).toBe('paused');
  const stopped = (await state(page)).score;
  await page.clock.runFor(6000);
  expect((await state(page)).screen).toBe('paused');
  expect((await state(page)).score).toBe(stopped);
  await expect(page.getByRole('button', { name: 'Enable autoplay' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const card = (await page.locator('.center-card').boundingBox())!;
    const preview = (await page.locator('#camera-preview').boundingBox())!;
    expect(
      card.x + card.width <= preview.x ||
        card.y + card.height <= preview.y ||
        preview.x + preview.width <= card.x ||
        preview.y + preview.height <= card.y,
    ).toBe(true);
    await page.screenshot({
      path: '.ai-local/camera-paused-' + viewport.width + '.png',
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    window.__noPose = true;
  });
  await page.getByRole('button', { name: 'Enable autoplay' }).click();
  await page.clock.runFor(5000);
  expect((await state(page)).screen).toBe('paused');
  await page.evaluate(() => {
    window.__noPose = false;
  });
  await page.clock.runFor(4800);
  expect((await state(page)).screen).toBe('play');
  await page.keyboard.press('KeyP');
  await page.clock.runFor(6000);
  expect((await state(page)).screen).toBe('paused');
  await expect(page.getByRole('button', { name: 'Enable autoplay' })).toBeVisible();
  // Backgrounding an armed session disarms it, including during reacquisition.
  await page.getByRole('button', { name: 'Enable autoplay' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(5000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(5000);
  expect((await state(page)).screen).toBe('paused');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('bostik-v1')!).settings.cameraAutoplay,
    ),
  ).toBe(false);
});

test('all four difficulties select, persist and change the actual running speed', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.clock.install({ time: new Date('2026-10-27T00:00:00Z') });
  await page.goto('./');
  await page.clock.pauseAt(new Date('2026-10-27T01:00:00Z'));
  await page.screenshot({ path: '.ai-local/difficulties-desktop.png', fullPage: true });
  for (const [name, speed] of [
    ['Practice trail', 8],
    ['Easy adventure', 11],
    ['Medium adventure', 15],
    ['Hard adventure', 19],
  ] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await playKeyboard(page, true);
    expect((await state(page)).speed).toBe(speed);
    await expect(page.locator('#mode-label')).toContainText(name);
    const before = (await state(page)).distance;
    await page.clock.runFor(1000);
    expect((await state(page)).distance - before).toBeCloseTo(speed, 0);
    await page.getByRole('link', { name: 'Bostik Game home' }).click();
  }
  await page.getByRole('button', { name: 'Parent corner' }).click();
  await expect(page.getByLabel('Adventure · next run')).toHaveValue('hard');
  await expect(page.getByLabel('Camera autoplay')).toBeChecked();
  await page.getByLabel('Camera autoplay').uncheck();
  await page.getByLabel('Adventure · next run').selectOption('medium');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Medium adventure', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Parent corner' }).click();
  await expect(page.getByLabel('Camera autoplay')).not.toBeChecked();
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
  await expect(page.getByRole('button', { name: 'Start calibration' })).toBeVisible({
    timeout: 45000,
  });
  await expect
    .poll(async () => (await state(page)).stats?.processed, { timeout: 45000 })
    .toBeGreaterThan(0);
});
