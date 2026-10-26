import Phaser from 'phaser';
import type { Simulation, TrackObject } from './simulation';

const C = {
  sky: 0xdcece3,
  hill: 0xb8cdb0,
  hill2: 0x93b897,
  grass: 0x87ab7b,
  dark: 0x315c43,
  track: 0xdcb78a,
  edge: 0xf7e6c6,
  line: 0xf0d7ad,
  fox: 0xeeb46b,
  cream: 0xffefd5,
  ink: 0x243f37,
  coral: 0xdf7659,
};

export class MeadowScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private simulation?: Simulation;
  private preview = true;
  private low = false;
  private clock = 0;
  frames = 0;
  fps = 0;
  private frameTime = 0;
  constructor(private tick: (delta: number) => void) {
    super('meadow');
  }
  create() {
    this.g = this.add.graphics();
  }
  show(simulation?: Simulation, preview = false, low = false) {
    this.simulation = simulation;
    this.preview = preview;
    this.low = low;
  }
  update(_time: number, delta: number) {
    this.tick(delta / 1000);
    this.clock += Math.min(delta, 50) / 1000;
    this.frames++;
    this.frameTime += delta;
    if (this.frameTime >= 1000) {
      this.fps = (this.frames * 1000) / this.frameTime;
      this.frames = 0;
      this.frameTime = 0;
    }
    if (this.g) this.draw();
  }
  private circle(x: number, y: number, r: number, color: number, alpha = 1) {
    this.g.fillStyle(color, alpha).fillCircle(x, y, r);
  }
  private polygon(points: number[][], color: number, alpha = 1) {
    this.g.fillStyle(color, alpha).beginPath().moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach((p) => this.g.lineTo(p[0], p[1]));
    this.g.closePath().fillPath();
  }
  private tree(x: number, y: number, scale: number, variant: number) {
    const g = this.g;
    g.fillStyle(0x8d926c).fillRoundedRect(
      x - 7 * scale,
      y - 75 * scale,
      14 * scale,
      90 * scale,
      5 * scale,
    );
    this.circle(x - 20 * scale, y - 99 * scale, 37 * scale, variant ? 0x6d956f : 0x73987b);
    this.circle(x + 23 * scale, y - 105 * scale, 34 * scale, variant ? 0x7fa578 : 0x85a888);
    this.circle(x, y - 137 * scale, 40 * scale, variant ? 0x8caf81 : 0x94b69a);
    g.lineStyle(2 * scale, 0xffffff, 0.13).lineBetween(
      x - 12 * scale,
      y - 140 * scale,
      x - 18 * scale,
      y - 127 * scale,
    );
  }
  private project(lane: number, z: number) {
    const depth = Math.max(0, Math.min(1.1, 1 - z / 66));
    const p = depth * depth;
    const center = this.preview ? 825 : 640;
    return { x: center + lane * (25 + 202 * p), y: 239 + 424 * p, s: 0.12 + p * 1.02 };
  }
  private star(x: number, y: number, radius: number, alpha = 1) {
    const points = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? radius * 0.48 : radius;
      return [x + Math.cos(a) * r, y + Math.sin(a) * r];
    });
    this.polygon(points, 0xffd36d, alpha);
    this.circle(x - radius * 0.18, y - radius * 0.2, radius * 0.12, 0xfff5cf, alpha);
  }
  private object(object: TrackObject) {
    const p = this.project(object.lane, object.z),
      g = this.g;
    if (object.checked) return;
    if (object.kind === 'star') {
      this.circle(p.x, p.y - 24 * p.s, 24 * p.s, 0xffe4a1, 0.24);
      this.star(p.x, p.y - 27 * p.s + Math.sin(this.clock * 3 + object.id) * 3, 18 * p.s);
    } else if (object.kind === 'log') {
      g.fillStyle(0x5d5b41, 0.16).fillEllipse(p.x, p.y + 3, 105 * p.s, 17 * p.s);
      g.fillStyle(0xa2754f).fillRoundedRect(
        p.x - 47 * p.s,
        p.y - 40 * p.s,
        94 * p.s,
        40 * p.s,
        15 * p.s,
      );
      this.circle(p.x + 36 * p.s, p.y - 20 * p.s, 19 * p.s, 0xd6aa76);
      g.lineStyle(3 * p.s, 0xb88c60).strokeCircle(p.x + 36 * p.s, p.y - 20 * p.s, 11 * p.s);
      g.lineStyle(3 * p.s, 0xc69762).lineBetween(
        p.x - 35 * p.s,
        p.y - 27 * p.s,
        p.x + 15 * p.s,
        p.y - 27 * p.s,
      );
      this.polygon(
        [
          [p.x - 12 * p.s, p.y - 38 * p.s],
          [p.x - 28 * p.s, p.y - 56 * p.s],
          [p.x + 2 * p.s, p.y - 44 * p.s],
        ],
        0x7a9b65,
      );
    } else {
      g.lineStyle(11 * p.s, 0x718467)
        .beginPath()
        .moveTo(p.x - 51 * p.s, p.y)
        .lineTo(p.x - 51 * p.s, p.y - 135 * p.s)
        .lineTo(p.x + 51 * p.s, p.y - 135 * p.s)
        .lineTo(p.x + 51 * p.s, p.y)
        .strokePath();
      g.fillStyle(0x719765).fillRoundedRect(
        p.x - 65 * p.s,
        p.y - 140 * p.s,
        130 * p.s,
        64 * p.s,
        22 * p.s,
      );
      for (let i = -1; i <= 1; i++)
        this.circle(p.x + i * 32 * p.s, p.y - 117 * p.s, 18 * p.s, 0x8daa73);
      this.circle(p.x - 25 * p.s, p.y - 118 * p.s, 5 * p.s, 0xf3d692);
    }
  }
  private fox(x: number, y: number, scale: number, duck: boolean, airborne: boolean) {
    const g = this.g,
      s = scale,
      h = duck ? 0.63 : 1;
    const bodyY = y - 58 * s * h;
    // Tail and little walking boots.
    g.fillStyle(C.fox).fillEllipse(x + 42 * s, bodyY + 8 * s, 65 * s, 35 * s);
    this.polygon(
      [
        [x + 62 * s, bodyY - 3 * s],
        [x + 82 * s, bodyY + 5 * s],
        [x + 62 * s, bodyY + 22 * s],
      ],
      C.cream,
    );
    const walk = airborne || this.simulation?.paused ? 0 : Math.sin(this.clock * 12) * 5 * s;
    g.fillStyle(C.ink)
      .fillRoundedRect(x - 30 * s, y - 13 * s + walk, 25 * s, 17 * s, 7 * s)
      .fillRoundedRect(x + 4 * s, y - 13 * s - walk, 25 * s, 17 * s, 7 * s);
    g.fillStyle(0x517866).fillRoundedRect(x - 34 * s, bodyY - 5 * s, 68 * s, 52 * s * h, 21 * s);
    g.fillStyle(C.fox)
      .fillEllipse(x - 38 * s, bodyY + 8 * s, 24 * s, 38 * s)
      .fillEllipse(x + 38 * s, bodyY + 8 * s, 24 * s, 38 * s);
    const headY = bodyY - 38 * s * h;
    this.polygon(
      [
        [x - 39 * s, headY - 19 * s],
        [x - 45 * s, headY - 70 * s],
        [x - 5 * s, headY - 42 * s],
      ],
      C.fox,
    );
    this.polygon(
      [
        [x + 39 * s, headY - 19 * s],
        [x + 45 * s, headY - 70 * s],
        [x + 5 * s, headY - 42 * s],
      ],
      C.fox,
    );
    this.polygon(
      [
        [x - 32 * s, headY - 30 * s],
        [x - 36 * s, headY - 55 * s],
        [x - 16 * s, headY - 38 * s],
      ],
      0xce8260,
    );
    this.polygon(
      [
        [x + 32 * s, headY - 30 * s],
        [x + 36 * s, headY - 55 * s],
        [x + 16 * s, headY - 38 * s],
      ],
      0xce8260,
    );
    g.fillStyle(C.fox).fillRoundedRect(x - 46 * s, headY - 45 * s, 92 * s, 82 * s, 35 * s);
    this.polygon(
      [
        [x - 45 * s, headY - 5 * s],
        [x, headY + 6 * s],
        [x + 45 * s, headY - 5 * s],
        [x + 28 * s, headY + 29 * s],
        [x, headY + 41 * s],
        [x - 28 * s, headY + 29 * s],
      ],
      C.cream,
    );
    this.circle(x - 20 * s, headY - 12 * s, 4.5 * s, C.ink);
    this.circle(x + 20 * s, headY - 12 * s, 4.5 * s, C.ink);
    this.circle(x - 21 * s, headY - 14 * s, 1.5 * s, 0xffffff);
    this.circle(x + 19 * s, headY - 14 * s, 1.5 * s, 0xffffff);
    this.polygon(
      [
        [x - 7 * s, headY + 6 * s],
        [x + 7 * s, headY + 6 * s],
        [x, headY + 13 * s],
      ],
      C.ink,
    );
    g.lineStyle(1.5 * s, C.ink)
      .beginPath()
      .moveTo(x - 6 * s, headY + 18 * s)
      .lineTo(x, headY + 21 * s)
      .lineTo(x + 6 * s, headY + 18 * s)
      .strokePath();
    g.fillStyle(C.coral).fillRoundedRect(x - 37 * s, bodyY - 10 * s, 74 * s, 15 * s, 7 * s);
    this.polygon(
      [
        [x + 17 * s, bodyY],
        [x + 39 * s, bodyY + 28 * s],
        [x + 48 * s, bodyY + 15 * s],
        [x + 31 * s, bodyY - 3 * s],
      ],
      C.coral,
    );
    this.star(x, bodyY + 23 * s, 8 * s);
  }
  private draw() {
    const g = this.g,
      center = this.preview ? 825 : 640;
    g.clear();
    g.fillStyle(C.sky).fillRect(0, 0, 1280, 720);
    this.circle(1020, 105, 62, 0xf5d99a);
    this.circle(1020, 105, 79, 0xf5d99a, 0.18);
    // Soft cloud shapes, hand-shaped hills, a tiny faraway cottage.
    for (const [x, y, s] of [
      [730, 78, 0.7],
      [1135, 160, 0.55],
      [315, 125, 0.8],
    ]) {
      g.fillStyle(0xf6f7e9, 0.7).fillRoundedRect(x - 46 * s, y, 110 * s, 19 * s, 10 * s);
      this.circle(x - 10 * s, y, 24 * s, 0xf6f7e9, 0.7);
      this.circle(x + 21 * s, y, 18 * s, 0xf6f7e9, 0.7);
    }
    this.polygon(
      [
        [0, 265],
        [0, 199],
        [150, 156],
        [320, 207],
        [460, 172],
        [650, 218],
        [810, 173],
        [1010, 216],
        [1160, 185],
        [1280, 215],
        [1280, 330],
      ],
      C.hill,
    );
    g.fillStyle(0xeaddb7).fillRoundedRect(center + 115, 199, 43, 31, 4);
    this.polygon(
      [
        [center + 106, 200],
        [center + 137, 176],
        [center + 165, 200],
      ],
      0xb47d59,
    );
    g.fillStyle(C.dark).fillRoundedRect(center + 131, 213, 10, 17, 3);
    this.polygon(
      [
        [0, 320],
        [0, 253],
        [170, 217],
        [380, 274],
        [570, 233],
        [center, 245],
        [1060, 237],
        [1280, 265],
        [1280, 720],
        [0, 720],
      ],
      C.grass,
    );
    this.polygon(
      [
        [center - 62, 238],
        [center + 62, 238],
        [center + 454, 720],
        [center - 454, 720],
      ],
      C.edge,
    );
    this.polygon(
      [
        [center - 55, 238],
        [center + 55, 238],
        [center + 432, 720],
        [center - 432, 720],
      ],
      C.track,
    );
    for (const side of [-1, 1])
      this.polygon(
        [
          [center + side * 17, 242],
          [center + side * 20, 242],
          [center + side * 147, 720],
          [center + side * 141, 720],
        ],
        C.line,
      );
    const travel = this.simulation && !this.preview ? this.simulation.distance : this.clock * 2;
    for (let i = 0; i < 12; i++) {
      const z = (((i * 6 - travel) % 70) + 70) % 70;
      const p = this.project(0, z);
      g.lineStyle(Math.max(1, p.s * 2), 0xeacaa0, 0.55).lineBetween(
        center - 295 * p.s,
        p.y,
        center + 295 * p.s,
        p.y,
      );
    }
    for (let i = 0; i < (this.low ? 6 : 12); i++) {
      const side = i % 2 ? 1 : -1;
      const depth = Math.floor(i / 2) / 6;
      this.tree(
        center + side * (126 + depth * 570),
        280 + depth * depth * 410,
        0.45 + depth * 1.3,
        i % 3,
      );
    }
    if (!this.low)
      for (let i = 0; i < 36; i++) {
        const x = (i * 293 + 31) % 1280,
          y = 350 + ((i * 97) % 360);
        if (Math.abs(x - center) < 120 + (y - 238) * 0.91) continue;
        g.lineStyle(2, 0x5e8d68).lineBetween(x, y, x - 3, y - 10);
        this.circle(x - 3, y - 12, 3.5, i % 3 ? 0xf0d9a0 : 0xf4eadd);
      }
    const simulation = this.simulation;
    if (simulation && !this.preview)
      [...simulation.objects].sort((a, b) => b.z - a.z).forEach((o) => this.object(o));
    else {
      for (let i = 0; i < 7; i++)
        this.object({ id: i, kind: 'star', z: 18 + i * 6, lane: i < 3 ? 0 : 1 });
      this.object({ id: 10, kind: 'log', z: 30, lane: -1 });
      this.object({ id: 11, kind: 'arch', z: 45, lane: 1 });
    }
    const activeAvatar = !!simulation && (!this.preview || simulation.sandbox);
    const x = center + (activeAvatar ? simulation.playerX * 202 : 0);
    const y = 631,
      jump = activeAvatar ? simulation.height * 95 : Math.sin(this.clock * 2) * 3;
    g.fillStyle(0x3d513d, 0.16).fillEllipse(x, y + 2, 108 - jump * 0.15, 24 - jump * 0.06);
    this.fox(x, y - jump, this.preview ? 1.26 : 1, !!simulation?.duck && activeAvatar, jump > 12);
    if (simulation && simulation.invulnerable > 0 && !this.preview) {
      g.lineStyle(3, 0xffe5a5, 0.65).strokeEllipse(x, y - 72 - jump, 142, 185);
      this.star(x - 76, y - 125 - jump, 11);
      this.star(x + 68, y - 90 - jump, 8);
    }
  }
}

export function createMeadow(parent: HTMLElement, tick: (delta: number) => void) {
  const scene = new MeadowScene(tick);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1280,
    height: 720,
    backgroundColor: '#dcece3',
    scene: [scene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true },
    fps: { target: 60 },
    render: { antialias: true, roundPixels: false },
    banner: false,
  });
  return { game, scene };
}
