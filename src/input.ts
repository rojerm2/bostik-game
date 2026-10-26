import type { Actions, Mode } from './types';
import { neutral } from './types';

export class InputHub {
  private held = neutral();
  constructor(public mode: Mode) {}
  setMode(mode: Mode) {
    this.mode = mode;
    this.clear();
  }
  clear() {
    this.held = neutral();
  }
  submit(source: Mode, actions: Actions) {
    if (source !== this.mode) return;
    this.held = { lane: actions.lane, duck: actions.duck, jump: this.held.jump || actions.jump };
  }
  read(): Actions {
    const result = { ...this.held };
    this.held.jump = false;
    return result;
  }
  peek(): Actions {
    return { ...this.held };
  }
}

export function attachKeyboard(hub: InputHub, pause: () => void, enabled: () => boolean) {
  const down = (e: KeyboardEvent) => {
    if (!enabled() || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName)) return;
    if (['Escape', 'KeyP'].includes(e.code) && !e.repeat) {
      e.preventDefault();
      pause();
      return;
    }
    if (hub.mode !== 'keyboard') return;
    const current = hub.peek();
    if (['ArrowLeft', 'KeyA'].includes(e.code)) current.lane = -1;
    else if (['ArrowRight', 'KeyD'].includes(e.code)) current.lane = 1;
    else if (['ArrowUp', 'Space', 'KeyW'].includes(e.code)) current.jump = !e.repeat;
    else if (['ArrowDown', 'KeyS'].includes(e.code)) current.duck = true;
    else return;
    e.preventDefault();
    hub.submit('keyboard', current);
  };
  const up = (e: KeyboardEvent) => {
    if (hub.mode !== 'keyboard') return;
    const current = hub.peek();
    if (['ArrowLeft', 'KeyA'].includes(e.code) && current.lane === -1) current.lane = 0;
    if (['ArrowRight', 'KeyD'].includes(e.code) && current.lane === 1) current.lane = 0;
    if (['ArrowDown', 'KeyS'].includes(e.code)) current.duck = false;
    hub.submit('keyboard', current);
  };
  const blur = () => hub.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}
