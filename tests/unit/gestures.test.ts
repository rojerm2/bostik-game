import { describe, expect, it } from 'vitest';
import { Calibrator, GestureRecognizer, TrackingGate } from '../../src/tracking/gestures';
import { baseline, body, observation } from '../fixtures/synthetic';
import { DEFAULT_SETTINGS } from '../../src/types';

const ready = (gesture = new GestureRecognizer(baseline, DEFAULT_SETTINGS), start = 0) => {
  for (let t = start; t <= start + 700; t += 50) gesture.process(observation(t));
  return gesture;
};
describe('stable calibration', () => {
  it('collects duration-based samples, mirrors nothing twice, and supports different torso sizes', () => {
    for (const scale of [0.65, 1, 1.2]) {
      const c = new Calibrator(true);
      let result;
      for (let t = 0; t <= 1600; t += 67) result = c.add(observation(t, { scale })) || result;
      expect(result?.centerX).toBeCloseTo(0.5);
      expect(result?.torso).toBeCloseTo(0.2 * scale);
    }
  });
  it('rejects incomplete, ambiguous, unstable and sparse calibration, then recalibrates', () => {
    const c = new Calibrator(true);
    for (let t = 0; t < 1600; t += 67) expect(c.add(observation(t, { feet: false }))).toBeNull();
    expect(c.feedback).toContain('feet');
    c.reset();
    for (let t = 0; t < 1600; t += 67)
      expect(c.add(observation(t, { x: t % 2 ? 0.3 : -0.3 }))).toBeNull();
    c.reset();
    expect(c.add({ timestamp: 0, bodies: [body(), body()] })).toBeNull();
    expect(c.feedback).toContain('One');
    expect(c.add(observation(1000))).toBeNull();
    expect(c.add(observation(3000))).toBeNull();
    c.reset();
    let result;
    for (let t = 0; t <= 1500; t += 50) result = c.add(observation(t)) || result;
    expect(result?.feet).toBe(true);
  });
  it('accepts missing feet only with an explicitly selected alternative', () => {
    const c = new Calibrator(false);
    let result;
    for (let t = 0; t <= 1500; t += 50) result = c.add(observation(t, { feet: false })) || result;
    expect(result?.feet).toBe(false);
  });
});
describe('position controls', () => {
  it('holds left/right positions without repeated transitions and returns to center', () => {
    const g = ready();
    let changes = 0;
    for (let t = 750; t <= 1600; t += 50) {
      const r = g.process(observation(t, { x: -0.65 }));
      changes += Number(r.laneChanged);
      expect(r.actions.jump).toBe(false);
    }
    expect(changes).toBe(1);
    let r = g.process(observation(1650, { x: 0 }));
    for (let t = 1700; t <= 1900; t += 50) r = g.process(observation(t));
    expect(r.actions.lane).toBe(0);
    for (let t = 1950; t <= 2300; t += 50) r = g.process(observation(t, { x: 0.65 }));
    expect(r.actions.lane).toBe(1);
  });
  it('dead zone and hysteresis resist noise and threshold wobble', () => {
    const g = ready();
    for (let t = 750; t <= 2500; t += 50)
      expect(
        g.process(observation(t, { x: Math.sin(t) * 0.18, lift: Math.sin(t) * 0.02 })).actions,
      ).toEqual({ lane: 0, jump: false, duck: false });
    for (let t = 2550; t <= 2900; t += 50) g.process(observation(t, { x: 0.6 }));
    for (let t = 2950; t <= 3300; t += 50)
      expect(g.process(observation(t, { x: 0.32 })).actions.lane).toBe(1);
  });
});
describe('jump, crouch and rearm', () => {
  it.each([33, 67, 125])('detects one sideways jump, lands and rearms at %i ms sampling', (dt) => {
    const g = ready();
    let t = 750,
      count = 0,
      simultaneous = false;
    const send = (lift: number, x = 0.7) => {
      const r = g.process(observation(t, { lift, footLift: Math.max(0, lift - 0.02), x }));
      t += dt;
      count += Number(r.actions.jump);
      simultaneous ||= r.actions.jump && r.actions.lane === 1;
    };
    for (let i = 0; i < 5; i++) send(0);
    for (const lift of [0.05, 0.12, 0.2, 0.28, 0.28, 0.25, 0.18, 0.05, 0]) send(lift);
    for (let i = 0; i < Math.ceil(400 / dt); i++) send(0);
    expect(count).toBe(1);
    expect(simultaneous).toBe(true);
    for (const lift of [0.06, 0.12, 0.2, 0.28, 0.22, 0]) send(lift);
    expect(count).toBe(2);
  });
  it('does not jump from a crouch or torso noise without foot evidence', () => {
    const g = ready();
    let r;
    for (let t = 750; t <= 1300; t += 50) {
      r = g.process(observation(t, { crouch: 0.4, footLift: 0 }));
      expect(r.actions.jump).toBe(false);
    }
    expect(r?.actions.duck).toBe(true);
    for (let t = 1350; t <= 1700; t += 50) r = g.process(observation(t));
    expect(r?.actions.duck).toBe(false);
    for (let t = 1750; t <= 2100; t += 50)
      expect(g.process(observation(t, { lift: 0.3, footLift: 0 })).actions.jump).toBe(false);
  });
  it('permits a squat before takeoff and produces only one jump', () => {
    const g = ready();
    let t = 750,
      count = 0;
    for (let i = 0; i < 6; i++) {
      count += Number(g.process(observation(t, { crouch: 0.4, footLift: 0 })).actions.jump);
      t += 50;
    }
    for (const lift of [-0.2, 0, 0.12, 0.22, 0.3, 0.3, 0.2, 0]) {
      count += Number(
        g.process(observation(t, { lift, footLift: Math.max(0, lift) })).actions.jump,
      );
      t += 50;
    }
    expect(count).toBe(1);
  });
  it('disables missing-foot jumping but still allows lane controls', () => {
    const g = ready();
    let r;
    for (let t = 750; t <= 1150; t += 50) {
      r = g.process(observation(t, { feet: false, x: -0.7, lift: 0.25 }));
      expect(r.actions.jump).toBe(false);
      expect(r.status).toBe('feet');
    }
    expect(r?.actions.lane).toBe(-1);
  });
  it('uses explicitly selected hands, holds once and rearms after lowering', () => {
    const g = ready(
      new GestureRecognizer(
        { ...baseline, feet: false },
        { ...DEFAULT_SETTINGS, jumpGesture: 'hands' },
      ),
    );
    let t = 750,
      count = 0;
    for (let i = 0; i < 15; i++) {
      count += Number(g.process(observation(t, { hands: true, feet: false })).actions.jump);
      t += 50;
    }
    expect(count).toBe(1);
    for (let i = 0; i < 8; i++) {
      g.process(observation(t, { feet: false }));
      t += 50;
    }
    for (let i = 0; i < 8; i++) {
      count += Number(g.process(observation(t, { hands: true, feet: false })).actions.jump);
      t += 50;
    }
    expect(count).toBe(2);
  });
});
describe('invalid input and recovery', () => {
  it('suppresses occluded, ambiguous, stale, future, invalid and out-of-order data', () => {
    for (const o of [
      observation(800, { visibility: 0.2 }),
      { timestamp: 800, bodies: [] },
      { timestamp: 800, bodies: [body(), body()] },
      observation(500),
      observation(NaN),
      observation(10000),
    ]) {
      const g = ready();
      expect(g.process(o, 800).valid).toBe(false);
      expect(g.process(o, 800).actions.jump).toBe(false);
    }
    for (const value of [NaN, Infinity, -1, 2]) {
      const g = ready(),
        b = body();
      b.leftHip.x = value;
      expect(g.process({ timestamp: 800, bodies: [b] }).valid).toBe(false);
    }
  });
  it('requires stable reacquisition without phantom jumps or stuck crouches', () => {
    const g = ready();
    g.process(observation(800, { crouch: 0.5 }));
    g.process({ timestamp: 850, bodies: [] });
    expect(g.process(observation(900, { lift: 0.3 })).valid).toBe(false);
    for (let t = 950; t <= 1550; t += 50)
      expect(g.process(observation(t)).actions.jump).toBe(false);
    expect(g.process(observation(1600)).valid).toBe(true);
  });
  it('pauses at configured duration, latches pause and requires confirmation', () => {
    const gate = new TrackingGate(500, 0);
    expect(gate.update(true, 100)).toBe(false);
    expect(gate.update(false, 450)).toBe(false);
    expect(gate.tick(600)).toBe(true);
    expect(gate.confirm()).toBe(false);
    expect(gate.update(true, 700)).toBe(true);
    expect(gate.confirm()).toBe(true);
    expect(gate.tick(1201)).toBe(true);
    expect(gate.ready).toBe(false);
    expect(gate.confirm()).toBe(false);
  });
});
