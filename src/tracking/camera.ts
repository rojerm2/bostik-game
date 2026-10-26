export function cameraError(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera access is blocked. Allow the camera in your browser’s site settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No matching camera found. Connect a webcam or choose another camera.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'The camera is busy or disconnected. Close other camera apps, reconnect it, then try again.';
  return error instanceof Error ? error.message : 'The camera could not start. Please try again.';
}

export class CameraSession {
  private stream?: MediaStream;
  private epoch = 0;
  private ended?: () => void;
  constructor(
    private video: HTMLVideoElement,
    private interrupted: () => void,
    private devices: MediaDevices | undefined = navigator.mediaDevices,
  ) {}
  async start(deviceId?: string) {
    this.stop();
    const epoch = this.epoch;
    if (!this.devices?.getUserMedia)
      throw new Error(
        'Camera needs HTTPS or localhost and a browser with camera support. An ordinary HTTP LAN address cannot use the camera.',
      );
    const stream = await this.devices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
      },
    });
    if (epoch !== this.epoch) {
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = stream;
    this.ended = () => {
      if (epoch === this.epoch) {
        this.stop();
        this.interrupted();
      }
    };
    stream.getVideoTracks().forEach((t) => t.addEventListener('ended', this.ended!));
    this.video.srcObject = stream;
    try {
      await this.video.play();
    } catch (e) {
      if (epoch === this.epoch) this.stop();
      throw e;
    }
    return epoch === this.epoch;
  }
  async list() {
    try {
      return ((await this.devices?.enumerateDevices?.()) || []).filter(
        (d) => d.kind === 'videoinput',
      );
    } catch {
      // Enumeration is optional. A working granted stream should remain usable.
      return [];
    }
  }
  get active() {
    return !!this.stream?.getVideoTracks().some((t) => t.readyState === 'live');
  }
  stop() {
    this.epoch++;
    this.stream?.getTracks().forEach((t) => {
      if (this.ended) t.removeEventListener('ended', this.ended);
      t.stop();
    });
    this.stream = undefined;
    this.video.srcObject = null;
    this.ended = undefined;
  }
}
