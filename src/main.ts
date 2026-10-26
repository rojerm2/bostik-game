import './style.css';
import { enforceLocalNetwork } from './privacy';
import { shell, icon } from './ui';
import { InputHub, attachKeyboard } from './input';
import { Simulation } from './game/simulation';
import { createMeadow } from './game/scene';
import { GentleAudio } from './audio';
import { browserStorage, loadSaved, save } from './storage';
import { CameraSession, cameraError } from './tracking/camera';
import { PosePipeline } from './tracking/pipeline';
import { Calibrator, GestureRecognizer, TrackingGate, visible } from './tracking/gestures';
import type { Actions, Mode, Observation, Settings } from './types';

declare const __TEST_MODE__: boolean;
type Screen = 'home' | 'setup' | 'testing' | 'countdown' | 'play' | 'paused' | 'over';
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const show = (selector: string, visible: boolean) => {
  $(selector).hidden = !visible;
};

class BostikApp {
  private screen: Screen = 'home';
  private mode: Mode = 'keyboard';
  private saved = loadSaved(browserStorage());
  private settings: Settings = this.saved.settings;
  private hub = new InputHub('keyboard');
  private audio = new GentleAudio(this.settings.sound);
  private simulation = new Simulation(this.settings.difficulty);
  private playground = new Simulation('practice', 1729, true);
  private meadow!: ReturnType<typeof createMeadow>;
  private camera!: CameraSession;
  private pipeline?: PosePipeline;
  private recognizer?: GestureRecognizer;
  private calibrator?: Calibrator;
  private gate = new TrackingGate();
  private setupReady = false;
  private cameraDevices: MediaDeviceInfo[] = [];
  private cameraId = '';
  private setupEpoch = 0;
  private checks = new Set<string>();
  private trackingMessage = 'Stand still in the middle';
  private countdownEnd = 0;
  private lastUI = 0;
  private messageUntil = 0;
  private pauseReason = '';
  private removeKeyboard!: () => void;
  private modalReturnFocus?: HTMLElement;
  private testReplay = false;
  private disposed = false;
  private resumeAfterCountdown = false;
  constructor() {
    $('#app').innerHTML = shell();
    this.camera = new CameraSession($('#camera-video'), () =>
      this.cameraFailure('The camera disconnected. Reconnect it, then retry setup.'),
    );
    this.meadow = createMeadow($('#world'), (dt) => this.tick(dt));
    this.bind();
    this.update();
    this.removeKeyboard = attachKeyboard(
      this.hub,
      () => this.pause('Take a little breather'),
      () => ['play', 'testing', 'countdown'].includes(this.screen) && $('#modal').hidden === true,
    );
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pagehide', this.dispose);
    window.addEventListener('pageshow', this.onPageShow);
    void this.installOffline();
    if (__TEST_MODE__) this.exposeTestSeam();
    if (import.meta.env.DEV && new URL(location.href).searchParams.has('playground')) {
      const api = this.exposeTestSeam();
      void import('./dev/playground').then(({ mountPlayground }) => mountPlayground(api));
    }
  }
  private persist() {
    this.saved.settings = this.settings;
    if (!save(browserStorage(), this.saved))
      this.toast('Saving is unavailable. You can still play.');
  }
  private bind() {
    const video = $('#camera-video') as HTMLVideoElement;
    const fitPreview = () => {
      if (video.videoWidth && video.videoHeight)
        $('.video-wrap').style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    };
    video.addEventListener('loadedmetadata', fitPreview);
    video.addEventListener('resize', fitPreview);
    $('.brand').addEventListener('click', (e) => {
      e.preventDefault();
      this.home();
    });
    $('#camera-start').onclick = () => this.setupCamera();
    $('#keyboard-start').onclick = () => this.keyboard();
    $('#settings').onclick = () => this.openSettings();
    $('#guide').onclick = () => this.openGuide();
    $('#sound').onclick = () => {
      this.settings.sound = !this.settings.sound;
      this.audio.enabled = this.settings.sound;
      this.audio.unlock();
      this.persist();
      this.updateSound();
    };
    $('#fullscreen').onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        this.toast('Fullscreen is unavailable in this browser.');
      }
    };
    $('#pause').onclick = () => this.pause('Take a little breather');
    $('#stop-camera').onclick = () => this.setupCamera();
    document.querySelectorAll<HTMLButtonElement>('[data-difficulty]').forEach((button) => {
      button.onclick = () => {
        this.settings.difficulty = button.dataset.difficulty as Settings['difficulty'];
        this.persist();
        this.updateDifficulty();
      };
    });
    $('#layer').addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-do]')?.dataset.do;
      if (action === 'allow') void this.startCamera();
      if (action === 'calibrate') {
        this.calibrator = new Calibrator(this.settings.jumpGesture === 'jump');
        this.renderSetup();
      }
      if (action === 'start' || action === 'restart') this.countdown(false);
      if (action === 'resume') this.countdown(true);
      if (action === 'home') this.home();
      if (action === 'setup') this.setupCamera();
      if (action === 'keyboard') this.keyboard();
      if (action === 'hands') {
        this.settings.jumpGesture = 'hands';
        this.persist();
        this.calibrator = new Calibrator(false);
        this.renderSetup();
      }
    });
    $('#layer').addEventListener('change', (e) => {
      if ((e.target as HTMLElement).id === 'camera-select')
        void this.startCamera((e.target as HTMLSelectElement).value);
    });
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
      button.onpointerdown = (e) => {
        if (this.mode !== 'keyboard' || this.screen !== 'play') return;
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        const a = this.hub.peek(),
          action = button.dataset.action;
        if (action === 'left') a.lane = -1;
        if (action === 'right') a.lane = 1;
        if (action === 'jump') a.jump = true;
        if (action === 'duck') a.duck = true;
        this.hub.submit('keyboard', a);
      };
      const release = () => {
        const a = this.hub.peek();
        if (button.dataset.action === 'left' || button.dataset.action === 'right') a.lane = 0;
        if (button.dataset.action === 'duck') a.duck = false;
        this.hub.submit('keyboard', a);
      };
      button.onpointerup = release;
      button.onpointercancel = release;
      button.onlostpointercapture = release;
    }
    $('#modal').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeModal();
      }
      if (e.key !== 'Tab') return;
      const els = [...$('#modal').querySelectorAll<HTMLElement>('button,input,select,a[href]')];
      const first = els[0],
        last = els.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    });
  }
  private stopTracking() {
    this.setupEpoch++;
    this.pipeline?.stop();
    this.pipeline = undefined;
    this.camera.stop();
    this.recognizer = undefined;
    this.calibrator = undefined;
    this.setupReady = false;
    this.hub.clear();
    this.testReplay = false;
  }
  private home() {
    this.stopTracking();
    this.simulation.setPaused(true);
    this.screen = 'home';
    this.closeModal();
    this.update();
  }
  private keyboard() {
    this.stopTracking();
    this.audio.unlock();
    this.mode = 'keyboard';
    this.hub.setMode('keyboard');
    this.checks.clear();
    this.playground.setPaused(false);
    this.screen = 'testing';
    this.update();
  }
  private setupCamera() {
    this.stopTracking();
    this.audio.unlock();
    this.simulation.setPaused(true);
    this.mode = 'camera';
    this.hub.setMode('camera');
    this.screen = 'setup';
    this.checks.clear();
    this.trackingMessage = 'Camera is off';
    this.update();
  }
  private async startCamera(deviceId?: string) {
    this.stopTracking();
    const epoch = this.setupEpoch;
    this.trackingMessage = 'Opening camera…';
    this.renderSetup('Allow camera access in your browser.');
    try {
      const started = await this.camera.start(deviceId);
      if (!started || epoch !== this.setupEpoch) return;
      show('#camera-preview', true);
      this.trackingMessage = 'Loading movement model…';
      this.renderSetup('Loading your private movement model. This may take a moment.');
      const pipeline = new PosePipeline(
        $('#camera-video'),
        this.settings.poseHz,
        (o) => this.observation(o),
        (message) => this.cameraFailure(message),
      );
      this.pipeline = pipeline;
      await pipeline.start();
      if (epoch !== this.setupEpoch) {
        pipeline.stop();
        return;
      }
      this.setupReady = true;
      this.trackingMessage = 'Fit inside the guide. Leave space around you.';
      this.renderSetup();
      const devices = await this.camera.list();
      if (epoch !== this.setupEpoch) return;
      this.cameraDevices = devices;
      const stream = ($('#camera-video') as HTMLVideoElement).srcObject as MediaStream;
      this.cameraId =
        stream?.getVideoTracks()[0]?.getSettings().deviceId || devices[0]?.deviceId || '';
      this.fillCameraSelect();
    } catch (error) {
      if (epoch === this.setupEpoch) this.cameraFailure(cameraError(error));
    }
  }
  private cameraFailure(message: string) {
    this.stopTracking();
    this.simulation.setPaused(true);
    this.screen = 'setup';
    this.trackingMessage = message;
    this.update();
    this.renderSetup(message);
  }
  private observation(o: Observation, synthetic = false) {
    if (this.mode !== 'camera' || (!synthetic && !this.camera.active)) return;
    this.drawPose(o);
    if (this.screen === 'setup' && this.calibrator) {
      const baseline = this.calibrator.add(o);
      this.trackingMessage = this.calibrator.feedback;
      const progress = document.querySelector<HTMLProgressElement>('#calibration-progress');
      if (progress) progress.value = this.calibrator.progress;
      if (baseline) {
        this.recognizer = new GestureRecognizer(baseline, this.settings);
        this.calibrator = undefined;
        this.gate = new TrackingGate(this.settings.lossTimeout, performance.now());
        this.screen = 'testing';
        this.playground.setPaused(false);
        this.update();
      }
    } else if (this.recognizer) {
      const r = this.recognizer.process(o, synthetic ? o.timestamp : performance.now());
      const messages = {
        ready: 'Ready · you’re in control',
        lost: 'Show your shoulders and hips. Try more light.',
        ambiguous: 'One adventurer at a time. Clear the view.',
        feet: 'Feet hidden · hopping is off. Step back or choose hands in Parent corner.',
        hands: 'Hands hidden · show both hands to hop.',
        reacquiring: 'Stand tall and still for a moment',
        moved: 'Your position changed. Return to your spot or recalibrate.',
      };
      this.trackingMessage = messages[r.status];
      this.gate.update(r.valid, performance.now());
      if (r.valid && ['testing', 'play'].includes(this.screen))
        this.hub.submit('camera', r.actions);
      else this.hub.clear();
      if (this.screen === 'testing' && r.valid) this.testActions(r.actions);
      if (this.screen === 'play' && this.gate.paused) this.pause('Let’s find you again');
      if (this.screen === 'paused') this.updateResume();
    }
    $('#tracking-status').textContent = this.trackingMessage;
  }
  private drawPose(o: Observation) {
    const canvas = $('#pose-overlay') as HTMLCanvasElement,
      c = canvas.getContext('2d')!;
    c.clearRect(0, 0, 640, 480);
    if (this.screen === 'setup') {
      c.strokeStyle = '#f9ebbb';
      c.lineWidth = 3;
      c.setLineDash([12, 9]);
      c.strokeRect(160, 30, 320, 425);
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(320, 30);
      c.lineTo(320, 455);
      c.strokeStyle = '#ffffff55';
      c.stroke();
    }
    const edges = [
      ['leftShoulder', 'rightShoulder'],
      ['leftShoulder', 'leftHip'],
      ['rightShoulder', 'rightHip'],
      ['leftHip', 'rightHip'],
      ['leftHip', 'leftFoot'],
      ['rightHip', 'rightFoot'],
      ['leftShoulder', 'leftWrist'],
      ['rightShoulder', 'rightWrist'],
    ] as const;
    for (const body of o.bodies) {
      c.strokeStyle = '#f4d780';
      c.lineWidth = 4;
      for (const [a, b] of edges)
        if (visible(body[a]) && visible(body[b])) {
          c.beginPath();
          c.moveTo(body[a].x * 640, body[a].y * 480);
          c.lineTo(body[b].x * 640, body[b].y * 480);
          c.stroke();
        }
      for (const p of Object.values(body))
        if (visible(p)) {
          c.fillStyle = '#fff5cd';
          c.beginPath();
          c.arc(p.x * 640, p.y * 480, 5, 0, Math.PI * 2);
          c.fill();
        }
    }
  }
  private testActions(a: Actions) {
    if (a.lane === -1) this.checks.add('left');
    if (a.lane === 1) this.checks.add('right');
    if (a.jump) this.checks.add('jump');
    if (a.duck) this.checks.add('duck');
    document.querySelectorAll<HTMLElement>('[data-check]').forEach((el) => {
      const done = this.checks.has(el.dataset.check!);
      el.classList.toggle('done', done);
      el.querySelector('i')!.innerHTML = done ? icon('check') : '';
    });
    const button = document.querySelector<HTMLButtonElement>('[data-do="start"]');
    if (button) button.disabled = this.mode === 'camera' && this.checks.size < 4;
  }
  private countdown(resume: boolean) {
    if (
      this.mode === 'camera' &&
      (!this.recognizer || (resume && !this.gate.ready) || (!resume && this.checks.size < 4))
    )
      return;
    this.closeModal();
    this.audio.unlock();
    this.hub.clear();
    this.recognizer?.reset();
    if (!resume) this.simulation = new Simulation(this.settings.difficulty, Date.now() >>> 0);
    this.simulation.setPaused(true);
    this.gate = new TrackingGate(this.settings.lossTimeout, performance.now());
    this.countdownEnd = performance.now() + 3600;
    this.resumeAfterCountdown = resume;
    this.screen = 'countdown';
    this.update();
  }
  private pause(reason: string) {
    if (!['play', 'countdown'].includes(this.screen)) return;
    this.simulation.setPaused(true);
    this.hub.clear();
    this.recognizer?.reset();
    if (this.mode === 'camera') {
      if (this.gate.ready) this.trackingMessage = 'Stand tall and still in view before continuing.';
      this.gate.update(false, performance.now());
    }
    this.screen = 'paused';
    this.pauseReason = reason;
    this.update();
  }
  private updateResume() {
    const button = document.querySelector<HTMLButtonElement>('[data-do="resume"]');
    if (button)
      button.disabled =
        this.mode === 'camera' && (!this.gate.ready || (!this.camera.active && !this.testReplay));
    const status = document.querySelector('#resume-status');
    if (status && this.mode === 'camera')
      status.textContent = this.gate.ready
        ? 'Ready. Resume when you’re comfortable.'
        : this.trackingMessage;
  }
  private tick(dt: number) {
    if (this.disposed) return;
    const now = performance.now();
    if (this.mode === 'camera' && ['play', 'countdown', 'paused'].includes(this.screen)) {
      const wasReady = this.gate.ready;
      this.gate.tick(now);
      if (wasReady && !this.gate.ready) {
        this.trackingMessage = 'Stand tall and still in view before continuing.';
        $('#tracking-status').textContent = this.trackingMessage;
      }
    }
    if (this.screen === 'countdown') {
      const remaining = Math.ceil((this.countdownEnd - now) / 1000);
      const label = document.querySelector('#countdown-number');
      if (label) label.textContent = remaining > 3 ? 'Ready?' : Math.max(1, remaining).toString();
      if (now >= this.countdownEnd) {
        if (this.mode === 'camera' && !this.gate.ready) this.pause('Let’s find you again');
        else {
          this.hub.clear();
          this.gate.confirm();
          if (this.resumeAfterCountdown) this.simulation.resumeSafely();
          else this.simulation.setPaused(false);
          this.screen = 'play';
          this.update();
        }
      }
    }
    if (this.screen === 'play') {
      if (this.mode === 'camera' && this.gate.tick(now)) this.pause('Let’s find you again');
      else {
        this.simulation.advance(dt, this.hub.read());
        for (const event of this.simulation.drainEvents()) {
          this.audio.play(event);
          if (event === 'bump') this.toast('A little bump. Keep exploring!');
          if (event === 'star' && this.simulation.stars % 5 === 0)
            this.toast('Five more stars! Lovely moves.');
          if (event === 'over') this.finish();
        }
      }
    }
    if (this.screen === 'testing') {
      const actions = this.hub.read();
      if (this.mode === 'keyboard') this.testActions(actions);
      this.playground.advance(dt, actions);
      this.playground.drainEvents();
    }
    if (now - this.lastUI > 100) {
      this.lastUI = now;
      this.updateHUD();
      if (this.screen === 'paused') this.updateResume();
    }
    if (this.messageUntil && now > this.messageUntil) {
      $('#toast').classList.remove('visible');
      this.messageUntil = 0;
    }
  }
  private finish() {
    this.simulation.setPaused(true);
    this.hub.clear();
    this.saved.best = Math.max(this.saved.best, this.simulation.score);
    this.persist();
    this.screen = 'over';
    this.update();
  }
  private update() {
    const home = this.screen === 'home',
      inGame = ['play', 'paused', 'over', 'countdown'].includes(this.screen);
    show('#hero', home);
    show('#features', home);
    show('#hud', inGame);
    show('#lesson', this.screen === 'play');
    show('#camera-preview', this.mode === 'camera' && (this.camera.active || this.setupReady));
    show('#touch-controls', this.mode === 'keyboard' && this.screen === 'play');
    show('#layer', !home && this.screen !== 'play');
    $('.game-stage').classList.toggle('setup-stage', ['setup', 'testing'].includes(this.screen));
    $('.game-stage').classList.toggle('is-home', home);
    $('#mode-label').innerHTML = home
      ? `${icon('camera')} Made for movement <span>·</span> Ages 5+ with a grown-up`
      : `${icon(this.mode === 'camera' ? 'camera' : 'keyboard')} ${this.mode === 'camera' ? 'Camera controls · mirrored' : 'Keyboard controls · arrows or WASD'} <span>·</span> ${this.settings.difficulty === 'practice' ? 'Practice trail' : 'Easy adventure'}`;
    this.meadow.scene.show(
      this.screen === 'testing' ? this.playground : this.simulation,
      home || ['setup', 'testing'].includes(this.screen),
      this.settings.quality === 'low',
    );
    this.updateSound();
    this.updateDifficulty();
    this.updateHUD();
    if (this.screen === 'setup') this.renderSetup();
    if (this.screen === 'testing') this.renderTesting();
    if (this.screen === 'countdown')
      $('#layer').innerHTML =
        `<div class="countdown-card"><span class="pill">YOUR ADVENTURE AWAITS</span><h2 id="countdown-number">Ready?</h2><p>${this.mode === 'camera' ? 'Stand in the middle. You’ve got this.' : 'Get your arrow keys ready.'}</p><button class="text-button" data-do="home">Back to meadow</button></div>`;
    if (this.screen === 'paused') {
      $('#layer').innerHTML =
        `<div class="dialog-card center-card"><span class="round-icon">${icon('pause')}</span><span class="eyebrow">A MOMENT TO REST</span><h2>${this.pauseReason}</h2><p id="resume-status">${this.mode === 'camera' ? this.trackingMessage : 'Pip will wait right here for you.'}</p><button class="primary-button" data-do="resume">${icon('play')} Continue adventure</button><button class="text-button" data-do="${this.mode === 'camera' ? 'setup' : 'home'}">${this.mode === 'camera' ? 'Set up camera again' : 'Back to meadow'}</button></div>`;
      this.updateResume();
    }
    if (this.screen === 'over')
      $('#layer').innerHTML =
        `<div class="dialog-card center-card"><span class="round-icon">${icon('star')}</span><span class="eyebrow">LOOK HOW FAR YOU CAME</span><h2>Lovely exploring!</h2><p>Every little move is an adventure.</p><div class="result-stats"><span><strong>${this.simulation.stars}</strong>stars found</span><span><strong>${this.simulation.score}</strong>adventure score</span></div><button class="primary-button" data-do="restart">One more adventure ${icon('arrow')}</button><button class="text-button" data-do="home">Back to meadow</button></div>`;
    if (!home && this.screen !== 'play')
      setTimeout(
        () =>
          $('#layer')
            .querySelector<HTMLElement>('button:not([disabled])')
            ?.focus({ preventScroll: true }),
        0,
      );
  }
  private renderSetup(message = '') {
    if (this.screen !== 'setup') return;
    $('#layer').innerHTML =
      `<div class="dialog-card setup-card"><span class="step-count">01 <span>/ 03 · CAMERA & SPACE</span></span><h2>Hello, adventurer.</h2><p>Clear a little space. Ask a grown-up to secure the camera and stay nearby.</p><ol class="setup-tips"><li><span>1</span> Face the screen, with your whole body in view.</li><li><span>2</span> Stand in the middle, with room to move.</li><li><span>3</span> We’ll find your comfortable standing pose.</li></ol>${message ? '<p id="setup-message" class="notice" role="status"></p>' : ''}${this.setupReady ? `<label class="camera-select-label">Camera <select id="camera-select" aria-label="Camera selection"></select></label>${this.calibrator ? '<progress id="calibration-progress" max="1" value="0" aria-label="Calibration progress"></progress><p class="calibration-hint">Stand still while the bar fills.</p>' : '<button class="primary-button" data-do="calibrate">I’m standing in the middle ' + icon('arrow') + '</button>'}<button class="text-button" data-do="hands">Can’t show your feet? Use hands to hop</button>` : `<button class="primary-button" data-do="allow">${icon('camera')} Allow camera & continue</button>`}<button class="text-button" data-do="keyboard">Use keyboard instead</button><span class="privacy-line">${icon('shield')} No recording. No microphone. Always local.</span></div>`;
    if (message) $('#setup-message').textContent = message;
    this.fillCameraSelect();
    $('#tracking-status').textContent = this.trackingMessage;
  }
  private fillCameraSelect() {
    const select = document.querySelector<HTMLSelectElement>('#camera-select');
    if (!select) return;
    select.replaceChildren();
    this.cameraDevices.forEach((d, i) => {
      const option = document.createElement('option');
      option.value = d.deviceId;
      option.textContent = d.label || `Camera ${i + 1}`;
      select.append(option);
    });
    select.value = this.cameraId;
  }
  private renderTesting() {
    const camera = this.mode === 'camera';
    const moves = [
      ['left', camera ? 'Step left' : '← or A · Left'],
      ['right', camera ? 'Step right' : '→ or D · Right'],
      [
        'jump',
        camera
          ? this.settings.jumpGesture === 'hands'
            ? 'Raise both hands'
            : 'Little hop'
          : '↑ or Space · Hop',
      ],
      ['duck', camera ? 'Crouch down' : '↓ or S · Crouch'],
    ];
    $('#layer').innerHTML =
      `<div class="dialog-card setup-card"><span class="step-count">${camera ? '03 / 03' : '01 / 01'} <span>· TRY YOUR MOVES</span></span><h2>A little wiggle first.</h2><p>${camera ? 'Stand tall for a moment, then try each move. Pip follows you like a mirror.' : 'Hold a direction, then let go to come back to the middle. Small moves are all you need.'}</p><div class="move-checks">${moves.map(([key, text]) => `<div data-check="${key}"><span>${text}</span><i></i></div>`).join('')}</div><p class="small-copy">${camera ? 'Hold a crouch to stay low. Return to standing between hops.' : 'You can also use the large on-screen buttons during play.'}</p><button class="primary-button" data-do="start" ${camera ? 'disabled' : ''}>Let’s explore ${icon('arrow')}</button><button class="text-button" data-do="${camera ? 'setup' : 'home'}">${camera ? 'Recalibrate' : 'Back to meadow'}</button></div>`;
    this.testActions(this.hub.peek());
  }
  private updateHUD() {
    $('#stars').textContent = this.simulation.stars.toString();
    $('#score').textContent = this.simulation.score.toString();
    $('#hearts').innerHTML = Array.from({ length: 3 }, (_, i) =>
      icon('heart', i < this.simulation.hearts ? 'heart-full' : 'heart-empty'),
    ).join('');
    $('#hearts').setAttribute('aria-label', `${this.simulation.hearts} hearts`);
    $('#best').textContent = this.saved.best.toString();
    $('#lesson-label').textContent =
      this.settings.difficulty === 'practice' ? 'PRACTICE TRAIL' : 'EASY ADVENTURE';
    $('#lesson-text').textContent = this.simulation.lesson;
  }
  private updateSound() {
    $('#sound').innerHTML = icon(this.settings.sound ? 'sound' : 'mute');
    $('#sound').setAttribute('aria-label', this.settings.sound ? 'Mute sound' : 'Enable sound');
    this.audio.enabled = this.settings.sound;
  }
  private updateDifficulty() {
    document.querySelectorAll<HTMLElement>('[data-difficulty]').forEach((b) => {
      const selected = b.dataset.difficulty === this.settings.difficulty;
      b.classList.toggle('selected', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
  }
  private toast(message: string) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    this.messageUntil = performance.now() + 2500;
  }
  private modal(content: string) {
    this.pause('Take a little breather');
    this.modalReturnFocus = document.activeElement as HTMLElement;
    $('#modal').innerHTML =
      `<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button id="close-modal" class="icon-button modal-close" aria-label="Close dialog">${icon('close')}</button>${content}</section>`;
    show('#modal', true);
    $('.app-shell').inert = true;
    $('#close-modal').onclick = () => this.closeModal();
    $('#close-modal').focus();
  }
  private closeModal() {
    if ($('#modal').hidden) return;
    show('#modal', false);
    $('.app-shell').inert = false;
    this.modalReturnFocus?.focus({ preventScroll: true });
  }
  private openSettings() {
    const s = this.settings;
    const select = (name: string, options: [string, string][], value: string) =>
      `<select name="${name}">${options.map(([v, label]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
    this.modal(
      `<span class="eyebrow">FOR THE GROWN-UPS</span><h2 id="modal-title">Parent corner</h2><p>Comfortable moves make happy adventures.</p><form id="settings-form"><label>Adventure${select(
        'difficulty',
        [
          ['practice', 'Practice trail · one move at a time'],
          ['easy', 'Easy adventure · all moves'],
        ],
        s.difficulty,
      )}</label><label>Movement sensitivity <span class="field-note">Higher means smaller side steps.</span><input name="sensitivity" type="range" min="0.65" max="1.6" step="0.05" value="${s.sensitivity}"/></label><label>Hop gesture${select(
        'jumpGesture',
        [
          ['jump', 'Little jump · both feet must be visible'],
          ['hands', 'Raise both hands · feet optional'],
        ],
        s.jumpGesture,
      )}</label><div class="form-row"><label>Scene detail${select(
        'quality',
        [
          ['high', 'Full meadow'],
          ['low', 'Simple meadow'],
        ],
        s.quality,
      )}</label><label>Tracking rate${select(
        'poseHz',
        [
          ['15', '15 updates / second'],
          ['8', '8 · less processing'],
        ],
        String(s.poseHz),
      )}</label></div><label>Pause after lost tracking${select(
        'lossTimeout',
        [
          ['300', '0.3 seconds'],
          ['500', '0.5 seconds · recommended'],
          ['1000', '1 second'],
        ],
        String(s.lossTimeout),
      )}</label><label class="checkbox-label"><input type="checkbox" name="sound" ${s.sound ? 'checked' : ''}/> Gentle game sounds</label><button class="primary-button" type="submit">Save settings</button><button id="reset-calibration" class="text-button" type="button">Reset calibration & set up camera</button></form><details class="diagnostics"><summary>Tracking diagnostics</summary><p id="diagnostics"></p><p>Software processing time only. Physical motion-to-screen latency has not been measured.</p></details>`,
    );
    const stats = this.pipeline?.stats;
    $('#diagnostics').textContent = stats
      ? `${stats.backend} / ${stats.delegate} · ${stats.inferenceMs.toFixed(0)} ms inference · ${stats.pipelineMs.toFixed(0)} ms pipeline · ${stats.poseHz.toFixed(1)} pose Hz · ${this.meadow.scene.fps.toFixed(0)} render FPS. One frame in flight, no waiting queue.`
      : `Camera is off. ${this.meadow.scene.fps.toFixed(0)} render FPS. No camera measurements available.`;
    $('#settings-form').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target as HTMLFormElement);
      const changed =
        Number(f.get('sensitivity')) !== s.sensitivity ||
        f.get('jumpGesture') !== s.jumpGesture ||
        Number(f.get('poseHz')) !== s.poseHz ||
        Number(f.get('lossTimeout')) !== s.lossTimeout;
      this.settings = {
        sensitivity: Number(f.get('sensitivity')),
        jumpGesture: f.get('jumpGesture') as Settings['jumpGesture'],
        difficulty: f.get('difficulty') as Settings['difficulty'],
        quality: f.get('quality') as Settings['quality'],
        poseHz: Number(f.get('poseHz')),
        sound: f.has('sound'),
        lossTimeout: Number(f.get('lossTimeout')),
      };
      this.persist();
      this.closeModal();
      if (this.mode === 'camera' && changed && this.screen !== 'home') this.setupCamera();
      else this.update();
      this.toast('Settings saved. A new adventure uses your chosen trail.');
    };
    $('#reset-calibration').onclick = () => {
      this.closeModal();
      this.setupCamera();
    };
  }
  private openGuide() {
    this.modal(
      `<span class="eyebrow">A HAPPY PLACE TO PLAY</span><h2 id="modal-title">A little help for grown-ups.</h2><div class="guide-content"><h3>Make room for small moves</h3><p>Clear the floor, secure the camera near the screen, and supervise the first setup. Keep the whole child in view. No need to run toward the camera or make big jumps.</p><h3>Find your comfortable middle</h3><p>Use a bright, evenly lit space. Stand still to calibrate, then try a small step each way, a little hop and a crouch. Child-left moves Pip screen-left. With feet out of view, explicitly choose “Raise both hands” in Parent corner.</p><h3>Pause whenever you like</h3><p>Use the pause button, P or Escape. Moving out of view pauses after a short delay. Return to a standing pose, choose Continue, and wait for the countdown. One adventurer at a time.</p><h3>Your video stays here</h3><p>Frames and body landmarks are processed on this device, never recorded or uploaded. No microphone, accounts or analytics. Only preferences and best score are saved. Return home or stop the camera to turn it off.</p><h3>Take it to the big screen</h3><p>HDMI from a laptop to a TV is recommended. Place the camera near the screen. Camera access needs HTTPS or localhost; an ordinary HTTP LAN address won’t work. Wireless casting latency is unverified.</p><h3>Offline adventures</h3><p>After “Ready for offline adventures” appears, the game, model and WASM are cached. Keep the page open until ready. Browser storage eviction can require another online visit. Close and reopen this tab to apply an available update.</p></div>`,
    );
  }
  private async installOffline() {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          }),
        );
      }
      $('#offline-status').innerHTML = `${icon('shield')} Ready for offline adventures`;
      const update = () => {
        if (reg.waiting)
          $('#offline-status').textContent = 'Update ready · close and reopen this tab';
      };
      update();
      reg.addEventListener('updatefound', () =>
        reg.installing?.addEventListener('statechange', update),
      );
    } catch {
      $('#offline-status').textContent =
        'Offline setup unavailable · reconnect and reload to retry';
    }
  }
  private onVisibility = () => {
    if (document.hidden) {
      this.hub.clear();
      this.recognizer?.reset();
      this.pause('Welcome back when you’re ready');
    }
  };
  private onBlur = () => {
    this.hub.clear();
    this.pause('Welcome back when you’re ready');
  };
  private onPageShow = (event: PageTransitionEvent) => {
    // pagehide stops camera/models and tears down Phaser, including when the
    // browser stores the document in its back/forward cache.
    if (event.persisted) location.reload();
  };
  private dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTracking();
    this.removeKeyboard();
    this.audio.close();
    this.meadow.game.destroy(true);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
  };
  private exposeTestSeam() {
    const api = {
      beginReplay: () => {
        this.setupCamera();
        this.setupReady = true;
        this.testReplay = true;
        this.calibrator = new Calibrator(this.settings.jumpGesture === 'jump');
        this.update();
      },
      observe: (o: Observation) => this.observation(o, true),
      state: () => ({
        screen: this.screen,
        mode: this.mode,
        lane: this.simulation.lane,
        duck: this.simulation.duck,
        height: this.simulation.height,
        score: this.simulation.score,
        hearts: this.simulation.hearts,
        checks: [...this.checks],
        stats: this.pipeline?.stats,
        fps: this.meadow.scene.fps,
        input: this.hub.peek(),
      }),
      bump: (clearProtection = true) => {
        if (clearProtection) this.simulation.invulnerable = 0;
        this.simulation.objects.push({
          id: -1,
          lane: this.simulation.lane,
          z: 0.01,
          kind: 'log',
        });
      },
    };
    Object.assign(window, { __bostikTest: api });
    return api;
  }
}
enforceLocalNetwork(import.meta.env.BASE_URL);
new BostikApp();
