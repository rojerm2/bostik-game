import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Body, Observation, Point } from '../types';

export async function createModel(base: string) {
  const fileset = await FilesetResolver.forVisionTasks(base);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}/pose_landmarker_lite.task`, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 2,
    minPoseDetectionConfidence: 0.6,
    minPosePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    outputSegmentationMasks: false,
  });
}
export function observe(model: PoseLandmarker, image: ImageBitmap, timestamp: number): Observation {
  const begin = performance.now();
  const result = model.detectForVideo(image, timestamp);
  const bodies: Body[] = result.landmarks.map((points) => {
    // Mirror ONCE here; the video preview is mirrored in CSS. Overlay uses these x values.
    const p = (i: number): Point => ({
      x: 1 - points[i].x,
      y: points[i].y,
      visibility: points[i].visibility ?? 0,
    });
    return {
      leftShoulder: p(11),
      rightShoulder: p(12),
      leftHip: p(23),
      rightHip: p(24),
      leftFoot: p(27),
      rightFoot: p(28),
      leftWrist: p(15),
      rightWrist: p(16),
    };
  });
  return { timestamp, bodies, inferenceMs: performance.now() - begin };
}
