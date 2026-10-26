import { createModel, observe } from './pose-model';
import { enforceLocalNetwork } from '../privacy';
enforceLocalNetwork(import.meta.env.BASE_URL);
let model: Awaited<ReturnType<typeof createModel>> | undefined;
self.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'init') {
    try {
      model = await createModel(message.base);
      self.postMessage({ type: 'ready', delegate: 'CPU' });
    } catch {
      self.postMessage({ type: 'error', message: 'The local pose model could not load.' });
    }
  } else if (message.type === 'frame') {
    const image = message.image as ImageBitmap;
    try {
      if (!model) throw new Error('Model unavailable');
      self.postMessage({ type: 'result', observation: observe(model, image, message.timestamp) });
    } catch {
      self.postMessage({
        type: 'error',
        message: 'Pose processing stopped. Try setting up the camera again.',
      });
    } finally {
      image.close();
    }
  } else if (message.type === 'close') {
    model?.close();
    model = undefined;
    self.close();
  }
};
