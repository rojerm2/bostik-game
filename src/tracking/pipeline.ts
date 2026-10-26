import type { Observation } from '../types';
import { SingleFlight } from './single-flight';

export interface PipelineStats {
  inferenceMs: number;
  pipelineMs: number;
  poseHz: number;
  backend: 'worker' | 'main-thread';
  delegate: 'GPU' | 'CPU';
  processed: number;
}
export class PosePipeline {
  private worker?: Worker;
  private model?: Awaited<ReturnType<(typeof import('./pose-model'))['createModel']>>;
  private lane = new SingleFlight();
  private disposed = false;
  private raf = 0;
  private rejectPending?: (e: Error) => void;
  private lastVideoTime = -1;
  private lastOffer = -Infinity;
  private lastResult = 0;
  private base = new URL(`${import.meta.env.BASE_URL}vision`, location.origin).href;
  stats: PipelineStats = {
    inferenceMs: 0,
    pipelineMs: 0,
    poseHz: 0,
    backend: 'worker',
    delegate: 'CPU',
    processed: 0,
  };
  constructor(
    private video: HTMLVideoElement,
    private hz: number,
    private output: (o: Observation) => void,
    private failed: (message: string) => void,
  ) {}
  async start() {
    try {
      await this.initWorker();
    } catch {
      this.worker?.terminate();
      this.worker = undefined;
      if (this.disposed) return;
      this.stats.backend = 'main-thread';
      this.hz = Math.min(6, this.hz);
      try {
        this.model = await (await import('./pose-model')).createModel(this.base);
      } catch {
        throw new Error(
          'The movement model could not load. Check your connection, then retry setup. Run “npm run assets” for a local build.',
        );
      }
    }
    if (this.disposed) {
      this.model?.close();
      this.model = undefined;
      return;
    }
    this.loop();
  }
  private initWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      // MediaPipe's pinned WASM loader uses importScripts: bundle as a classic worker.
      const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'classic' });
      this.worker = worker;
      const timer = setTimeout(() => reject(new Error('Worker load timeout')), 25000);
      this.rejectPending = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Worker unavailable'));
      };
      worker.onmessage = (e) => {
        clearTimeout(timer);
        this.rejectPending = undefined;
        if (e.data.type === 'ready') {
          this.stats.delegate = e.data.delegate;
          resolve();
        } else reject(new Error(e.data.message));
      };
      worker.postMessage({ type: 'init', base: this.base });
    });
  }
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (
      document.hidden ||
      this.lane.busy ||
      this.video.readyState < 2 ||
      this.video.currentTime === this.lastVideoTime ||
      now - this.lastOffer < 1000 / this.hz
    )
      return;
    this.lastOffer = now;
    this.lastVideoTime = this.video.currentTime;
    void this.lane
      .run(
        async () => {
          const image = await createImageBitmap(this.video);
          try {
            if (this.disposed) throw new Error('Stopped');
            if (!this.worker) {
              const { observe } = await import('./pose-model');
              return observe(this.model!, image, now);
            }
            return await this.infer(image, now);
          } finally {
            image.close();
          }
        },
        (observation) => {
          const done = performance.now();
          const interval = this.lastResult ? done - this.lastResult : 0;
          this.lastResult = done;
          this.stats = {
            inferenceMs: observation.inferenceMs || 0,
            pipelineMs: done - now,
            poseHz: interval ? 1000 / interval : 0,
            backend: this.stats.backend,
            delegate: this.stats.delegate,
            processed: this.stats.processed + 1,
          };
          this.output(observation);
        },
      )
      .catch(() => {
        if (!this.disposed) {
          this.failed('Movement tracking stopped. Please retry camera setup.');
          this.stop();
        }
      });
  };
  private infer(image: ImageBitmap, timestamp: number): Promise<Observation> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Inference timeout')), 8000);
      this.rejectPending = (e) => {
        clearTimeout(timer);
        reject(e);
      };
      this.worker!.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Worker failed'));
      };
      this.worker!.onmessage = (e) => {
        clearTimeout(timer);
        this.rejectPending = undefined;
        if (e.data.type === 'result') resolve(e.data.observation);
        else reject(new Error(e.data.message));
      };
      this.worker!.postMessage({ type: 'frame', image, timestamp }, [image]);
    });
  }
  stop() {
    if (this.disposed) return;
    this.disposed = true;
    this.lane.invalidate();
    cancelAnimationFrame(this.raf);
    this.rejectPending?.(new Error('Stopped'));
    this.rejectPending = undefined;
    this.worker?.postMessage({ type: 'close' });
    this.worker?.terminate();
    this.worker = undefined;
    this.model?.close();
    this.model = undefined;
  }
}
