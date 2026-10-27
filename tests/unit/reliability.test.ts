import { describe, it, expect, vi } from 'vitest';
import { InputHub } from '../../src/input';
import { loadSaved, save } from '../../src/storage';
import { SingleFlight } from '../../src/tracking/single-flight';
import { CameraSession, cameraError } from '../../src/tracking/camera';
import { DEFAULT_SETTINGS, DIFFICULTIES } from '../../src/types';
import { localAssetRequest } from '../../src/privacy';
describe('local-only network policy', () => {
  it('permits static GETs and rejects telemetry, foreign origins and writes', () => {
    const allowed = (url: string, method = 'GET') =>
      localAssetRequest(url, method, 'https://game.example', '/bostik-game/');
    expect(allowed('/bostik-game/vision/model.task')).toBe(true);
    expect(allowed('https://odml.pa.googleapis.com/v1/log', 'POST')).toBe(false);
    expect(allowed('/bostik-game/vision/model.task', 'POST')).toBe(false);
    expect(allowed('https://other.example/model.task')).toBe(false);
    expect(allowed('/outside')).toBe(false);
  });
});
describe('common input and storage', () => {
  it('accepts only the chosen source, consumes jump once and clears held inputs', () => {
    const hub = new InputHub('camera');
    hub.submit('keyboard', { lane: 1, jump: true, duck: true });
    expect(hub.read().lane).toBe(0);
    hub.submit('camera', { lane: -1, jump: true, duck: true });
    expect(hub.read().jump).toBe(true);
    expect(hub.read()).toEqual({ lane: -1, jump: false, duck: true });
    hub.setMode('keyboard');
    expect(hub.read().duck).toBe(false);
  });
  it.each(['null', '{bad', '{"settings":{"sensitivity":99,"poseHz":999,"sound":"bad"},"best":-3}'])(
    'survives malformed persistence: %s',
    (text) => {
      expect(loadSaved({ getItem: () => text })).toEqual({ settings: DEFAULT_SETTINGS, best: 0 });
    },
  );
  it('survives read denial, quota failures and absent storage', () => {
    expect(
      loadSaved({
        getItem: () => {
          throw new Error('Denied');
        },
      }).best,
    ).toBe(0);
    expect(
      save(
        {
          setItem: () => {
            throw new Error('Quota');
          },
        },
        { settings: DEFAULT_SETTINGS, best: 2 },
      ),
    ).toBe(false);
    expect(save(undefined, { settings: DEFAULT_SETTINGS, best: 2 })).toBe(false);
  });
  it('migrates autoplay preferences and preserves every supported difficulty', () => {
    const read = (settings: object) =>
      loadSaved({ getItem: () => JSON.stringify({ settings, best: 10 }) });
    expect(read({ difficulty: 'easy' }).settings.cameraAutoplay).toBe(true);
    expect(read({ cameraAutoplay: 'false', difficulty: 'invalid' }).settings).toEqual(
      DEFAULT_SETTINGS,
    );
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      const result = read({ difficulty, cameraAutoplay: false });
      expect(result.settings.difficulty).toBe(difficulty);
      expect(result.settings.cameraAutoplay).toBe(false);
      expect(result.best).toBe(10);
    }
  });
});
describe('inference lifecycle', () => {
  it('bounds work at one in flight, drops offers and ignores late results', async () => {
    const lane = new SingleFlight(),
      apply = vi.fn();
    let resolve!: (n: number) => void;
    const first = lane.run(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
      apply,
    );
    for (let i = 0; i < 100; i++) expect(await lane.run(async () => 9, apply)).toBe(false);
    lane.invalidate();
    resolve(1);
    await first;
    expect(apply).not.toHaveBeenCalled();
    expect(lane.busy).toBe(false);
    await lane.run(async () => 2, apply);
    expect(apply).toHaveBeenCalledWith(2);
  });
  it('unlocks after an inference rejection', async () => {
    const lane = new SingleFlight();
    await expect(
      lane.run(async () => {
        throw new Error('bad');
      }, vi.fn()),
    ).rejects.toThrow();
    expect(lane.busy).toBe(false);
  });
});
describe('camera lifecycle independent of pose recognition', () => {
  const setup = () => {
    const stop = vi.fn(),
      addEventListener = vi.fn(),
      removeEventListener = vi.fn();
    const track = { stop, addEventListener, removeEventListener, readyState: 'live' };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const video = { srcObject: null, play: vi.fn(async () => {}) } as unknown as HTMLVideoElement;
    const devices = {
      getUserMedia: vi.fn(async () => stream),
      enumerateDevices: vi.fn(async () => []),
    } as unknown as MediaDevices;
    return { stop, addEventListener, stream, video, devices };
  };
  it('never requests audio and stops all tracks on repeated setup/stop', async () => {
    const f = setup(),
      session = new CameraSession(f.video, vi.fn(), f.devices);
    await session.start();
    await session.start('usb');
    session.stop();
    session.stop();
    expect(f.devices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
    expect(f.stop).toHaveBeenCalledTimes(2);
    expect(f.video.srcObject).toBeNull();
  });
  it('keeps a granted stream usable when camera enumeration is denied or unavailable', async () => {
    for (const absent of [false, true]) {
      const f = setup();
      if (absent) delete (f.devices as Partial<MediaDevices>).enumerateDevices;
      else
        f.devices.enumerateDevices = vi.fn(async () => {
          throw new Error('Enumeration denied');
        });
      const session = new CameraSession(f.video, vi.fn(), f.devices);
      await session.start();
      expect(await session.list()).toEqual([]);
      expect(session.active).toBe(true);
      expect(f.stop).not.toHaveBeenCalled();
      session.stop();
      expect(f.stop).toHaveBeenCalledOnce();
    }
  });
  it('stops late permission grants without attaching them', async () => {
    const f = setup();
    let resolve!: (s: MediaStream) => void;
    f.devices.getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((r) => {
          resolve = r;
        }),
    );
    const session = new CameraSession(f.video, vi.fn(), f.devices),
      pending = session.start();
    session.stop();
    resolve(f.stream);
    expect(await pending).toBe(false);
    expect(f.stop).toHaveBeenCalledOnce();
    expect(f.video.srcObject).toBeNull();
  });
  it.each(['NotAllowedError', 'NotFoundError', 'NotReadableError'])(
    'propagates %s with actionable messaging',
    async (name) => {
      const f = setup();
      f.devices.getUserMedia = vi.fn(async () => {
        const e = new Error();
        e.name = name;
        throw e;
      });
      const session = new CameraSession(f.video, vi.fn(), f.devices);
      await expect(session.start()).rejects.toThrow();
      expect(cameraError(Object.assign(new Error(), { name }))).toMatch(/camera/i);
    },
  );
  it('handles an ended device and unsupported APIs', async () => {
    const f = setup(),
      interrupted = vi.fn(),
      session = new CameraSession(f.video, interrupted, f.devices);
    await session.start();
    f.addEventListener.mock.calls[0][1]();
    expect(interrupted).toHaveBeenCalledOnce();
    expect(f.stop).toHaveBeenCalledOnce();
    const missing = new CameraSession(f.video, vi.fn(), {} as MediaDevices);
    await expect(missing.start()).rejects.toThrow(/HTTPS/);
  });
});
