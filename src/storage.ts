import { DEFAULT_SETTINGS, DIFFICULTIES } from './types';
import type { Settings } from './types';
export interface Saved {
  settings: Settings;
  best: number;
}
const bounded = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
export function loadSaved(storage: Pick<Storage, 'getItem'> | undefined): Saved {
  try {
    const raw = JSON.parse(storage?.getItem('bostik-v1') || '{}');
    const s = raw?.settings || {};
    return {
      best: Math.floor(bounded(raw?.best, 0, 1e9, 0)),
      settings: {
        cameraAutoplay: typeof s.cameraAutoplay === 'boolean' ? s.cameraAutoplay : true,
        sensitivity: bounded(s.sensitivity, 0.65, 1.6, 1),
        lossTimeout: bounded(s.lossTimeout, 300, 1000, 500),
        poseHz: [8, 15].includes(s.poseHz) ? s.poseHz : 15,
        jumpGesture: s.jumpGesture === 'hands' ? 'hands' : 'jump',
        difficulty: Object.keys(DIFFICULTIES).includes(s.difficulty) ? s.difficulty : 'practice',
        quality: s.quality === 'low' ? 'low' : 'high',
        sound: typeof s.sound === 'boolean' ? s.sound : true,
      },
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, best: 0 };
  }
}
export function save(storage: Pick<Storage, 'setItem'> | undefined, value: Saved): boolean {
  try {
    if (!storage) return false;
    storage.setItem('bostik-v1', JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function browserStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}
