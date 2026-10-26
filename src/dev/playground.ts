import { body } from '../../tests/fixtures/synthetic';
import type { Observation } from '../types';

/** Explicit localhost-only development entry; this module is absent from production. */
export function mountPlayground(api: {
  beginReplay(): void;
  observe(o: Observation): void;
  state(): unknown;
}) {
  const panel = document.createElement('aside');
  panel.style.cssText =
    'padding:20px;margin:20px;border:2px dashed #829b69;border-radius:16px;background:#f8f8ed;font:13px system-ui;position:relative;z-index:10';
  panel.innerHTML =
    '<h2>Synthetic tracking playground</h2><p>No camera. Calibrates for 1.4 seconds, then waits for stable standing. Buttons feed synthetic screen coordinates through the actual recognizer.</p><div id="replay-buttons"></div><pre id="replay-state"></pre>';
  document.body.append(panel);
  let options: Parameters<typeof body>[0] = {};
  let sequence: number | undefined;
  let ambiguous = false,
    absent = false;
  const choices = [
    'Center',
    'Left',
    'Right',
    'Hop right',
    'Crouch',
    'Hidden feet',
    'Low confidence',
    'Two players',
    'No player',
    'Reset',
  ];
  for (const choice of choices) {
    const button = document.createElement('button');
    button.textContent = choice;
    button.style.cssText =
      'padding:10px;margin:4px;border:1px solid #aaba96;border-radius:8px;background:#edf2df';
    button.onclick = () => {
      if (sequence !== undefined) clearInterval(sequence);
      options = {};
      ambiguous = false;
      absent = false;
      if (choice === 'Left') options = { x: -0.7 };
      if (choice === 'Right') options = { x: 0.7 };
      if (choice === 'Crouch') options = { crouch: 0.4, footLift: 0 };
      if (choice === 'Hidden feet') options = { feet: false };
      if (choice === 'Low confidence') options = { visibility: 0.2 };
      if (choice === 'Two players') ambiguous = true;
      if (choice === 'No player') absent = true;
      if (choice === 'Reset') api.beginReplay();
      if (choice === 'Hop right') {
        const lifts = [0, 0.05, 0.12, 0.2, 0.28, 0.25, 0.15, 0];
        let i = 0;
        sequence = window.setInterval(() => {
          options = { x: 0.7, lift: lifts[i++] || 0 };
          if (i >= lifts.length) clearInterval(sequence);
        }, 70);
      }
    };
    panel.querySelector('#replay-buttons')!.append(button);
  }
  api.beginReplay();
  const interval = window.setInterval(() => {
    const b = body(options);
    api.observe({ timestamp: performance.now(), bodies: absent ? [] : ambiguous ? [b, b] : [b] });
    panel.querySelector('#replay-state')!.textContent = JSON.stringify(api.state(), null, 2);
  }, 65);
  window.addEventListener(
    'pagehide',
    () => {
      clearInterval(interval);
      clearInterval(sequence);
    },
    { once: true },
  );
}
