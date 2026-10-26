import type { Body, Calibration, Observation } from '../../src/types';
export const baseline: Calibration = {
  centerX: 0.5,
  hipY: 0.55,
  shoulderY: 0.35,
  footY: 0.9,
  torso: 0.2,
  feet: true,
};
/** Hand-built coordinates only. No photographs, recordings, or personal body data. */
export function body(
  options: {
    x?: number;
    lift?: number;
    footLift?: number;
    crouch?: number;
    scale?: number;
    feet?: boolean;
    hands?: boolean;
    visibility?: number;
  } = {},
): Body {
  const {
    x = 0,
    lift = 0,
    footLift = lift,
    crouch = 0,
    scale = 1,
    feet = true,
    hands = false,
    visibility = 0.99,
  } = options;
  const t = 0.2 * scale,
    cx = 0.5 + x * t;
  const p = (x: number, y: number, v = visibility) => ({ x, y, visibility: v });
  const hip = 0.55 + (crouch - lift) * t,
    shoulder = hip - t;
  return {
    leftShoulder: p(cx - t * 0.4, shoulder),
    rightShoulder: p(cx + t * 0.4, shoulder),
    leftHip: p(cx - t * 0.25, hip),
    rightHip: p(cx + t * 0.25, hip),
    leftFoot: p(cx - t * 0.3, 0.9 - footLift * t, feet ? visibility : 0.1),
    rightFoot: p(cx + t * 0.3, 0.9 - footLift * t, feet ? visibility : 0.1),
    leftWrist: p(cx - t * 0.7, hands ? shoulder - 0.4 * t : hip),
    rightWrist: p(cx + t * 0.7, hands ? shoulder - 0.4 * t : hip),
  };
}
export const observation = (
  timestamp: number,
  options: Parameters<typeof body>[0] = {},
): Observation => ({ timestamp, bodies: [body(options)] });
