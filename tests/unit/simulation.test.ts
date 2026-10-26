import { describe, it, expect } from 'vitest';
import { generatePatterns, validatePatterns, Simulation } from '../../src/game/simulation';
import { neutral } from '../../src/types';
const run = (s: Simulation, seconds: number, fps = 60, input = neutral()) => {
  s.setPaused(false);
  for (let i = 0; i < seconds * fps; i++) s.advance(1 / fps, input);
};
describe('seeded generation', () => {
  it('certifies reachable safe routes for many seeds and speeds', () => {
    for (let seed = 0; seed < 1500; seed++)
      for (const speed of [8, 11, 18])
        expect(validatePatterns(generatePatterns(seed, speed, 100), speed)).toBe(true);
    expect(generatePatterns(1, 11, 30)).toEqual(generatePatterns(1, 11, 30));
  });
  it('rejects blocked routes, excessive reaction demands and malformed patterns', () => {
    const patterns = generatePatterns(3, 11, 5);
    patterns[0].objects.push({ lane: patterns[0].safe, kind: 'log' });
    expect(validatePatterns(patterns, 11)).toBe(false);
    const tooFast = generatePatterns(4, 11, 5);
    tooFast[1].at = tooFast[0].at + 1;
    expect(validatePatterns(tooFast, 11)).toBe(false);
    const wrong = generatePatterns(6, 11, 5);
    wrong[0].at = NaN;
    expect(validatePatterns(wrong, 11)).toBe(false);
    expect(validatePatterns([], 0)).toBe(false);
  });
});
describe('fixed-step runner', () => {
  it('protects a resumed player from an obstacle paused immediately at the crossing', () => {
    const s = new Simulation('easy');
    s.setPaused(false);
    s.advance(0, { lane: 0, jump: false, duck: true });
    s.objects = [{ id: -1, lane: 0, z: 0.01, kind: 'arch' }];
    s.setPaused(true);
    const distance = s.distance;
    s.advance(10, neutral());
    expect(s.distance).toBe(distance);
    s.resumeSafely();
    s.advance(1 / 60, neutral());
    expect(s.hearts).toBe(3);
    for (let i = 0; i < 90; i++) s.advance(1 / 60, neutral());
    expect(s.invulnerable).toBe(0);
    s.objects = [{ id: -2, lane: 0, z: 0.01, kind: 'log' }];
    s.advance(1 / 60, neutral());
    expect(s.hearts).toBe(2);
  });
  it('provides a movement playground with no obstacles, scoring or damage', () => {
    const s = new Simulation('practice', 1, true);
    run(s, 30, 60, { lane: -1, jump: true, duck: false });
    expect(s.playerX).toBe(-1);
    expect(s.objects).toHaveLength(0);
    expect(s.score).toBe(0);
    expect(s.hearts).toBe(3);
  });
  it('freezes all state when paused and discards large wall-clock gaps', () => {
    const s = new Simulation();
    run(s, 1);
    const score = s.score,
      distance = s.distance;
    s.setPaused(true);
    s.advance(0.1, { lane: 1, jump: true, duck: true });
    expect(s.score).toBe(score);
    expect(s.distance).toBe(distance);
    expect(s.lane).toBe(0);
    s.setPaused(false);
    s.advance(4, neutral());
    expect(s.distance).toBe(distance);
    s.advance(1 / 60, neutral());
    expect(s.distance - distance).toBeCloseTo(8 / 60);
  });
  it('behaves consistently at 30/60/120 FPS', () => {
    const games = [30, 60, 120].map((fps) => {
      const s = new Simulation();
      run(s, 10, fps);
      return s;
    });
    for (const s of games) {
      expect(s.distance).toBeCloseTo(80, 5);
      expect(s.elapsed).toBeCloseTo(10, 5);
    }
    expect(games.map((g) => g.score)).toEqual([games[0].score, games[0].score, games[0].score]);
  });
  it('collects stars, damages gently with invulnerability, and restarts cleanly', () => {
    const s = new Simulation('easy');
    s.objects = [
      { id: 1, z: 0.1, lane: 0, kind: 'star' },
      { id: 2, z: 0.1, lane: 0, kind: 'log' },
      { id: 3, z: 0.1, lane: 0, kind: 'arch' },
    ];
    run(s, 0.1);
    expect(s.stars).toBe(1);
    expect(s.hearts).toBe(2);
    expect(s.score).toBeGreaterThanOrEqual(10);
    const reset = new Simulation();
    expect(reset.score).toBe(0);
    expect(reset.hearts).toBe(3);
  });
  it('honors jump and duck windows, lands, and catches fast crossings', () => {
    const s = new Simulation('easy');
    s.objects = [{ id: 1, z: 2.5, lane: 0, kind: 'log' }];
    s.setPaused(false);
    s.advance(1 / 60, { lane: 0, jump: true, duck: false });
    for (let i = 0; i < 30; i++) s.advance(1 / 60, neutral());
    expect(s.hearts).toBe(3);
    for (let i = 0; i < 45; i++) s.advance(1 / 60, neutral());
    expect(s.height).toBe(0);
    s.objects = [{ id: 2, z: 0.1, lane: 0, kind: 'arch' }];
    s.advance(0.1, { lane: 0, jump: false, duck: true });
    expect(s.hearts).toBe(3);
    s.objects = [{ id: 3, z: 0.01, lane: 0, kind: 'log' }];
    s.advance(0.25, neutral());
    expect(s.hearts).toBe(2);
  });
  it('moves toward legal lanes over time and never beyond the selected edge', () => {
    const s = new Simulation();
    run(s, 0.5, 60, { lane: -1, jump: false, duck: false });
    expect(s.playerX).toBe(-1);
    run(s, 0.5, 60, { lane: 1, jump: false, duck: false });
    expect(s.playerX).toBe(1);
  });
});
