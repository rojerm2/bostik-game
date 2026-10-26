import type { Actions, Body, Calibration, Lane, Observation, Point, Settings } from '../types';
import { neutral } from '../types';

export const visible = (p: Point) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Number.isFinite(p.visibility) &&
  p.x >= 0 &&
  p.x <= 1 &&
  p.y >= 0 &&
  p.y <= 1 &&
  p.visibility >= 0.6;
const avg = (a: number, b: number) => (a + b) / 2;
export function measure(body: Body) {
  const torsoPoints = [body.leftShoulder, body.rightShoulder, body.leftHip, body.rightHip];
  if (!torsoPoints.every(visible)) return null;
  const hipX = avg(body.leftHip.x, body.rightHip.x);
  const hipY = avg(body.leftHip.y, body.rightHip.y);
  const shoulderY = avg(body.leftShoulder.y, body.rightShoulder.y);
  const torso = hipY - shoulderY;
  if (torso < 0.07 || torso > 0.6) return null;
  const feet = visible(body.leftFoot) && visible(body.rightFoot);
  return { hipX, hipY, shoulderY, torso, feet, footY: avg(body.leftFoot.y, body.rightFoot.y) };
}

export type TrackStatus =
  | 'ready'
  | 'lost'
  | 'ambiguous'
  | 'feet'
  | 'hands'
  | 'reacquiring'
  | 'moved';
export interface GestureResult {
  actions: Actions;
  status: TrackStatus;
  valid: boolean;
  laneChanged: boolean;
}

/** A duration-based calibration, deliberately not a fixed frame counter. */
export class Calibrator {
  private samples: { t: number; m: NonNullable<ReturnType<typeof measure>> }[] = [];
  private last = -Infinity;
  progress = 0;
  feedback = 'Stand still in the middle';
  constructor(private requireFeet: boolean) {}
  reset() {
    this.samples = [];
    this.progress = 0;
    this.last = -Infinity;
  }
  add(observation: Observation): Calibration | null {
    if (!Number.isFinite(observation.timestamp) || observation.timestamp <= this.last) return null;
    if (observation.timestamp - this.last > 300) this.reset();
    this.last = observation.timestamp;
    const bodies = observation.bodies.filter((b) => measure(b));
    const m = bodies.length === 1 ? measure(bodies[0]) : null;
    if (!m || (this.requireFeet && !m.feet)) {
      this.samples = [];
      this.progress = 0;
      this.feedback =
        bodies.length > 1
          ? 'One adventurer at a time'
          : m
            ? 'Step back a little — show both feet'
            : 'Show your shoulders and hips. Try more light.';
      return null;
    }
    if (m.hipX < 0.28 || m.hipX > 0.72 || m.shoulderY < 0.06 || (m.feet && m.footY > 0.97)) {
      this.samples = [];
      this.progress = 0;
      this.feedback = 'Fit inside the guide, with room above and below';
      return null;
    }
    const first = this.samples[0]?.m;
    if (
      first &&
      (Math.abs(m.hipX - first.hipX) > first.torso * 0.11 ||
        Math.abs(m.hipY - first.hipY) > first.torso * 0.09 ||
        Math.abs(m.torso - first.torso) > first.torso * 0.12)
    ) {
      this.samples = [];
      this.progress = 0;
      this.feedback = 'Stay still for a moment';
    }
    this.samples.push({ t: observation.timestamp, m });
    const duration = observation.timestamp - this.samples[0].t;
    this.progress = Math.min(1, duration / 1400);
    this.feedback = 'Hold your happy standing pose…';
    if (duration < 1400 || this.samples.length < 8) return null;
    const mean = (key: keyof typeof m) =>
      this.samples.reduce((sum, s) => sum + Number(s.m[key]), 0) / this.samples.length;
    this.feedback = 'Ready!';
    return {
      centerX: mean('hipX'),
      hipY: mean('hipY'),
      shoulderY: mean('shoulderY'),
      footY: mean('footY'),
      torso: mean('torso'),
      feet: this.samples.every((s) => s.m.feet),
    };
  }
}

export class GestureRecognizer {
  private lastTimestamp = -Infinity;
  private lastGood = -Infinity;
  private stableSince: number | null = null;
  private filteredX = 0;
  private lane: Lane = 0;
  private duck = false;
  private duckCandidate = false;
  private duckSince = 0;
  private phase: 'grounded' | 'airborne' | 'recovery' = 'recovery';
  private groundedSince: number | null = null;
  private liftSince: number | null = null;
  private handsSince: number | null = null;
  private previousHip = 0;
  private previousFeet = 0;
  private invalidated = true;
  constructor(
    public baseline: Calibration,
    private settings: Pick<Settings, 'sensitivity' | 'jumpGesture'>,
  ) {}
  reset() {
    this.lane = 0;
    this.duck = false;
    this.phase = 'recovery';
    this.stableSince = null;
    this.groundedSince = null;
    this.liftSince = null;
    this.handsSince = null;
    this.invalidated = true;
  }
  private fail(status: TrackStatus): GestureResult {
    this.reset();
    return { actions: neutral(), status, valid: false, laneChanged: false };
  }
  process(observation: Observation, now = observation.timestamp): GestureResult {
    const t = observation.timestamp;
    if (!Number.isFinite(t) || t <= this.lastTimestamp || now - t > 250 || t > now + 50)
      return this.fail('lost');
    const dt = Math.min(150, t - this.lastTimestamp);
    this.lastTimestamp = t;
    const bodies = observation.bodies.filter((b) => measure(b));
    if (bodies.length > 1) return this.fail('ambiguous');
    if (!bodies.length) return this.fail('lost');
    const body = bodies[0],
      m = measure(body)!;
    const b = this.baseline;
    // Identity continuity is geometric, not facial recognition. Never auto-switch scale.
    if (
      m.torso / b.torso < 0.55 ||
      m.torso / b.torso > 1.65 ||
      Math.abs(m.hipX - b.centerX) / b.torso > 2.2
    )
      return this.fail('moved');
    if (t - this.lastGood > 300) this.reset();
    this.lastGood = t;
    const hipLift = (b.hipY - m.hipY) / b.torso;
    const shoulderLift = (b.shoulderY - m.shoulderY) / b.torso;
    const footLift = (b.footY - m.footY) / b.torso;
    const feetGood = b.feet && m.feet;
    const handsGood = visible(body.leftWrist) && visible(body.rightWrist);
    const handsUp =
      handsGood &&
      body.leftWrist.y < m.shoulderY - b.torso * 0.2 &&
      body.rightWrist.y < m.shoulderY - b.torso * 0.2;
    const standing =
      Math.abs(hipLift) < 0.12 &&
      Math.abs(shoulderLift) < 0.15 &&
      (!feetGood || Math.abs(footLift) < 0.13) &&
      !handsUp;
    if (this.invalidated) {
      if (!standing) {
        this.stableSince = null;
        return { actions: neutral(), status: 'reacquiring', valid: false, laneChanged: false };
      }
      this.stableSince ??= t;
      if (t - this.stableSince < 600)
        return { actions: neutral(), status: 'reacquiring', valid: false, laneChanged: false };
      this.invalidated = false;
      this.filteredX = (m.hipX - b.centerX) / b.torso;
      this.phase = 'grounded';
      this.previousHip = hipLift;
      this.previousFeet = footLift;
    }
    const rawX = (m.hipX - b.centerX) / b.torso;
    this.filteredX += (rawX - this.filteredX) * (1 - Math.exp(-dt / 75));
    const enter = 0.42 / this.settings.sensitivity,
      exit = 0.23 / this.settings.sensitivity;
    const priorLane = this.lane;
    if (this.lane === 0) {
      if (this.filteredX > enter) this.lane = 1;
      else if (this.filteredX < -enter) this.lane = -1;
    } else if (this.lane === 1) {
      if (this.filteredX < -enter) this.lane = -1;
      else if (this.filteredX < exit) this.lane = 0;
    } else {
      if (this.filteredX > enter) this.lane = 1;
      else if (this.filteredX > -exit) this.lane = 0;
    }
    const crouched =
      hipLift < -(this.duck ? 0.17 : 0.26) && shoulderLift < -(this.duck ? 0.17 : 0.25);
    if (crouched !== this.duckCandidate) {
      this.duckCandidate = crouched;
      this.duckSince = t;
    }
    if (t - this.duckSince >= (crouched ? 110 : 160)) this.duck = crouched;
    let jump = false;
    if (this.settings.jumpGesture === 'hands') {
      if (!handsGood) {
        this.handsSince = null;
        this.phase = 'recovery';
      } else if (handsUp && !this.duck) {
        this.handsSince ??= t;
        if (this.phase === 'grounded' && t - this.handsSince >= 160) {
          jump = true;
          this.phase = 'airborne';
        }
        this.groundedSince = null;
      } else {
        this.handsSince = null;
        this.groundedSince ??= t;
        if (t - this.groundedSince > 260) this.phase = 'grounded';
      }
    } else if (!feetGood) {
      this.phase = 'recovery';
      this.liftSince = null;
      this.groundedSince = null;
    } else {
      // A lift must follow a rising torso AND rising feet. A squat alone moves down.
      const rising = hipLift - this.previousHip > 0.006 && footLift - this.previousFeet > 0.004;
      if (
        this.phase === 'grounded' &&
        hipLift > 0.095 &&
        shoulderLift > 0.07 &&
        footLift > 0.055 &&
        rising
      )
        this.liftSince ??= t;
      if (this.liftSince !== null && (hipLift < 0.07 || footLift < 0.035)) this.liftSince = null;
      if (
        this.phase === 'grounded' &&
        this.liftSince !== null &&
        t - this.liftSince >= 35 &&
        hipLift > 0.13 &&
        footLift > 0.08
      ) {
        jump = true;
        this.phase = 'airborne';
        this.liftSince = null;
      }
      if (this.phase !== 'grounded') {
        if (standing) {
          this.groundedSince ??= t;
          this.phase = 'recovery';
          if (t - this.groundedSince >= 220) {
            this.phase = 'grounded';
            this.groundedSince = null;
          }
        } else this.groundedSince = null;
      }
    }
    this.previousHip = hipLift;
    this.previousFeet = footLift;
    const status: TrackStatus =
      this.settings.jumpGesture === 'jump' && !feetGood
        ? 'feet'
        : this.settings.jumpGesture === 'hands' && !handsGood
          ? 'hands'
          : 'ready';
    return {
      actions: { lane: this.lane, jump, duck: this.duck },
      status,
      valid: true,
      laneChanged: priorLane !== this.lane,
    };
  }
}

/** Camera pause latch: lost inputs are suppressed before the pause timeout expires. */
export class TrackingGate {
  private lastGood: number;
  paused = false;
  ready = false;
  constructor(
    private timeout = 500,
    now = 0,
  ) {
    this.lastGood = now;
  }
  update(valid: boolean, now: number) {
    this.ready = valid;
    if (valid) this.lastGood = now;
    return this.tick(now);
  }
  tick(now: number) {
    if (now - this.lastGood >= this.timeout) {
      this.ready = false;
      this.paused = true;
    }
    return this.paused;
  }
  confirm() {
    if (this.ready) this.paused = false;
    return !this.paused;
  }
}
