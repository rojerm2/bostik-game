import type { GameEvent } from './game/simulation';
export class GentleAudio {
  private context?: AudioContext;
  constructor(public enabled = true) {}
  unlock() {
    if (this.enabled) {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    }
  }
  play(event: GameEvent) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const c = this.context,
      o = c.createOscillator(),
      gain = c.createGain();
    const notes: Record<GameEvent, number> = {
      star: 784,
      jump: 392,
      lane: 294,
      duck: 262,
      bump: 196,
      over: 262,
    };
    o.type = 'sine';
    o.frequency.setValueAtTime(notes[event], c.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      notes[event] * (event === 'bump' ? 0.8 : 1.3),
      c.currentTime + 0.12,
    );
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(event === 'lane' ? 0.015 : 0.045, c.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
    o.connect(gain);
    gain.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.2);
  }
  close() {
    void this.context?.close();
  }
}
