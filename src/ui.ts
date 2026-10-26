export const icons = {
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  camera:
    '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 1-3h6l1 3"/><circle cx="12" cy="13" r="4"/>',
  keyboard:
    '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h1m3 0h1m3 0h1m3 0h.1M6 13h1m3 0h1m3 0h1m3 0h.1M8 16h8"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  sound: '<path d="m11 4-5 4H3v8h3l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-5 4H3v8h3l5 4V4Zm5 5 6 6m0-6-6 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 3 1 4 4 2 3-1 4 1 3-4-1-3 1-4-4-3-3 1-3-1Z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 3 12 8 15 5-3 13-10 8-15Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  leaf: '<path d="M20 3C9 1 1 8 6 16s17 1 14-13ZM5 20l10-10"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};
export function icon(name: keyof typeof icons, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}
export function shell() {
  return `
  <div class="app-shell">
    <header class="site-header">
      <a class="brand" href="#" aria-label="Bostik Game home"><img src="${import.meta.env.BASE_URL}icon.svg" alt=""/><span>Bostik<span class="brand-game">GAME</span></span></a>
      <span class="brand-tagline">Little steps. Big adventures.</span>
      <nav class="header-actions" aria-label="Game options">
        <button id="sound" class="icon-button" aria-label="Mute sound" title="Sound">${icon('sound')}</button>
        <button id="fullscreen" class="icon-button" aria-label="Enter fullscreen" title="Fullscreen">${icon('expand')}</button>
        <span class="divider"></span><button id="settings" class="quiet-button">${icon('settings')}<span>Parent corner</span></button>
      </nav>
    </header>
    <main>
      <div class="eyebrow-row"><span class="eyebrow">${icon('leaf')} A LITTLE ADVENTURE, EVERY DAY</span><span class="world-indicator"><span></span> Sunbeam Meadow</span></div>
      <section class="game-stage" aria-label="Bostik Game">
        <div id="world" aria-label="Three-lane garden runner"></div>
        <div id="hero">
          <div class="hero-copy">
            <span class="pill">${icon('star')} MADE FOR LITTLE MOVERS</span>
            <h1>A little move.<br>A <em>big adventure.</em></h1>
            <p>Meet Pip. Your little fox, your big adventure.<br>Step, hop and crouch through a world of wonder.</p>
            <div class="trail-options" role="group" aria-label="Difficulty"><button data-difficulty="practice" class="selected">${icon('leaf')} Practice trail</button><button data-difficulty="easy">${icon('star')} Easy adventure</button></div>
            <button id="camera-start" class="primary-button">${icon('camera')} Let’s move ${icon('arrow')}</button>
            <button id="keyboard-start" class="text-button">${icon('keyboard')} Play with keyboard <span>→</span></button>
            <div class="hero-note"><span class="tiny-dot"></span> Your camera. Your moves. Always private.</div>
          </div>
          <div class="world-card"><span class="world-card-icon">${icon('leaf')}</span><span><small>YOUR FIRST ADVENTURE</small><strong>Sunbeam Meadow</strong></span><span class="world-card-dots">● ○ ○</span></div>
          <span class="pip-label">Pip is ready when you are <span>↗</span></span>
        </div>
        <div id="hud" hidden>
          <div class="hud-left"><div class="score-card">${icon('star')}<span><small>STARS</small><strong id="stars">0</strong></span></div><div class="score-card distance"><span><small>ADVENTURE SCORE</small><strong id="score">0</strong></span></div></div>
          <div class="hud-right"><span id="hearts" aria-label="3 hearts"></span><button id="pause" class="icon-button" aria-label="Pause game">${icon('pause')}</button></div>
        </div>
        <div id="toast" role="status" aria-live="polite"></div>
        <div id="lesson" hidden><span>${icon('leaf')}</span><div><small id="lesson-label">PRACTICE TRAIL</small><strong id="lesson-text"></strong></div></div>
        <div id="layer" class="stage-layer" hidden></div>
        <aside id="camera-preview" hidden aria-label="Mirrored camera preview">
          <div class="video-wrap"><video id="camera-video" autoplay muted playsinline></video><canvas id="pose-overlay" width="640" height="480"></canvas><span class="preview-live"><span></span> LOCAL CAMERA</span></div>
          <div id="tracking-status" class="tracking-status" role="status">Camera is off</div>
          <button id="stop-camera" class="text-button">Stop camera & return to setup</button>
        </aside>
        <div id="touch-controls" hidden aria-label="On-screen controls"><button data-action="left" aria-label="Move left">←</button><button data-action="jump" aria-label="Jump">↑ <span>Hop</span></button><button data-action="duck" aria-label="Crouch">↓ <span>Duck</span></button><button data-action="right" aria-label="Move right">→</button></div>
      </section>
      <div class="below-stage"><div id="mode-label">${icon('camera')} Made for movement <span>·</span> Ages 5+ with a grown-up</div><span id="best-label">${icon('star')} Your best <strong id="best">0</strong></span></div>
      <section id="features" class="features" aria-label="How to play"><div><span class="feature-icon">↔</span><span><strong>Step to explore</strong><small>Left, right, and back to the middle</small></span></div><div><span class="feature-icon">↟</span><span><strong>Little hops. Big smiles.</strong><small>Jump over logs, crouch under leaves</small></span></div><div><span class="feature-icon">${icon('shield')}</span><span><strong>Just play. Stay private.</strong><small>Camera video never leaves your device</small></span></div></section>
    </main>
    <footer><span>Made for happy feet & curious hearts.</span><div><span id="offline-status">${icon('shield')} No uploads. No accounts. Just adventure.</span><button id="guide" class="footer-link">Grown-up guide ↗</button></div></footer>
  </div><div id="modal" class="modal-backdrop" hidden></div>`;
}
