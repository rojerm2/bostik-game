import type { Actions, Difficulty, Lane } from '../types';
export type ObjectKind = 'star' | 'log' | 'arch';
export interface TrackObject {
  id: number;
  lane: Lane;
  z: number;
  kind: ObjectKind;
  checked?: boolean;
}
export interface Pattern {
  at: number;
  safe: Lane;
  objects: { lane: Lane; kind: ObjectKind }[];
}
export type GameEvent = 'star' | 'bump' | 'jump' | 'lane' | 'duck' | 'over';
export const REACTION_SECONDS = 1.8;
export const LANE_SECONDS = 0.22;
const lanes: Lane[] = [-1, 0, 1];
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function generatePatterns(seed: number, speed: number, count: number): Pattern[] {
  const random = seeded(seed),
    patterns: Pattern[] = [];
  let safe: Lane = 0,
    at = speed * 4;
  for (let i = 0; i < count; i++) {
    const possible = lanes.filter((l) => Math.abs(l - safe) <= 1);
    safe = possible[Math.floor(random() * possible.length)];
    const objects: Pattern['objects'] = [{ lane: safe, kind: 'star' }];
    for (const lane of lanes)
      if (lane !== safe && random() > 0.18)
        objects.push({ lane, kind: random() < 0.5 ? 'log' : 'arch' });
    patterns.push({ at, safe, objects });
    at += speed * (2.8 + random() * 0.5);
  }
  return patterns;
}
/** A conservative path certificate: a clear reachable lane at every encounter. */
export function validatePatterns(patterns: Pattern[], speed: number) {
  if (!Number.isFinite(speed) || speed <= 0) return false;
  let at = 0,
    lane: Lane = 0;
  for (const p of patterns) {
    if (!lanes.includes(p.safe) || !Number.isFinite(p.at) || p.at <= at) return false;
    if (p.objects.some((o) => !lanes.includes(o.lane) || !['star', 'log', 'arch'].includes(o.kind)))
      return false;
    if (p.objects.some((o) => o.lane === p.safe && o.kind !== 'star')) return false;
    if ((p.at - at) / speed < REACTION_SECONDS + Math.abs(p.safe - lane) * LANE_SECONDS)
      return false;
    at = p.at;
    lane = p.safe;
  }
  return true;
}

export class Simulation {
  objects: TrackObject[] = [];
  elapsed = 0;
  distance = 0;
  stars = 0;
  hearts = 3;
  lane: Lane = 0;
  playerX = 0;
  height = 0;
  duck = false;
  jumpTime = -1;
  invulnerable = 0;
  paused = true;
  over = false;
  private accumulator = 0;
  private cursor = 0;
  private nextId = 0;
  private patterns: Pattern[];
  events: GameEvent[] = [];
  readonly speed: number;
  constructor(
    public difficulty: Difficulty = 'practice',
    seed = 1729,
    public readonly sandbox = false,
  ) {
    this.speed = difficulty === 'practice' ? 8 : 11;
    this.patterns = generatePatterns(seed, this.speed, 512);
    if (!validatePatterns(this.patterns, this.speed)) throw new Error('Unsafe level');
  }
  get score() {
    return Math.floor(this.distance) + this.stars * 10;
  }
  get lesson() {
    if (this.difficulty !== 'practice') return 'Follow the stars. Find your own path.';
    if (this.elapsed < 18) return 'Step left and right. Follow the stars!';
    if (this.elapsed < 36) return 'Hop over the little garden logs.';
    if (this.elapsed < 54) return 'Crouch to scoot under the leafy arches.';
    return 'You’ve got this! Put your moves together.';
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.accumulator = 0;
    this.duck = false;
  }
  resumeSafely() {
    this.setPaused(false);
    // Inputs are cleared during the countdown. Allow a comfortable moment to act
    // even when the interruption happened immediately before an obstacle.
    this.invulnerable = Math.max(this.invulnerable, 1.25);
  }
  drainEvents() {
    const result = this.events;
    this.events = [];
    return result;
  }
  advance(seconds: number, input: Actions) {
    if (this.paused || this.over || !Number.isFinite(seconds) || seconds < 0 || seconds > 0.25) {
      this.accumulator = 0;
      return;
    }
    if (input.lane !== this.lane) {
      this.lane = input.lane;
      this.events.push('lane');
    }
    if (input.jump && this.jumpTime < 0) {
      this.jumpTime = 0;
      this.events.push('jump');
    }
    const duck = input.duck && this.jumpTime < 0;
    if (duck && !this.duck) this.events.push('duck');
    this.duck = duck;
    this.accumulator += seconds;
    while (this.accumulator + 1e-9 >= 1 / 120 && !this.over) {
      this.step(1 / 120);
      this.accumulator -= 1 / 120;
    }
  }
  private step(dt: number) {
    this.elapsed += dt;
    if (!this.sandbox) this.distance += this.speed * dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const dx = this.lane - this.playerX;
    this.playerX += Math.sign(dx) * Math.min(Math.abs(dx), dt / LANE_SECONDS);
    if (this.jumpTime >= 0) {
      this.jumpTime += dt;
      this.height = Math.max(0, Math.sin((Math.PI * this.jumpTime) / 0.95) * 1.1);
      if (this.jumpTime >= 0.95) {
        this.jumpTime = -1;
        this.height = 0;
      }
    }
    if (this.sandbox) return;
    while (
      this.cursor < this.patterns.length &&
      this.patterns[this.cursor].at - this.distance <= 65
    ) {
      const p = this.patterns[this.cursor++];
      const encounterTime = p.at / this.speed;
      for (const o of p.objects) {
        let kind = o.kind;
        if (this.difficulty === 'practice' && kind !== 'star') {
          if (encounterTime < 18) continue;
          if (encounterTime < 36) kind = 'log';
          else if (encounterTime < 54) kind = 'arch';
        }
        this.objects.push({ id: this.nextId++, lane: o.lane, kind, z: p.at - this.distance });
      }
    }
    for (const object of this.objects) {
      const before = object.z;
      object.z -= this.speed * dt;
      // Swept crossing test at a fixed simulation rate prevents tunneling.
      if (!object.checked && before > 0 && object.z <= 0) {
        object.checked = true;
        if (Math.abs(this.playerX - object.lane) > 0.56) continue;
        if (object.kind === 'star') {
          this.stars++;
          this.events.push('star');
        } else if (
          (object.kind === 'log' && this.height < 0.3) ||
          (object.kind === 'arch' && !this.duck)
        ) {
          if (this.invulnerable <= 0) {
            this.hearts--;
            this.invulnerable = 2;
            this.events.push('bump');
          }
          if (!this.hearts) {
            this.over = true;
            this.events.push('over');
          }
        }
      }
    }
    this.objects = this.objects.filter((o) => o.z > -5);
  }
}
