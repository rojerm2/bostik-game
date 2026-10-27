/** All pose coordinates are mirrored screen coordinates: x increases to the child's right.
 * Timestamps use performance.now() milliseconds, strictly increasing within a session. */
export type Lane = -1 | 0 | 1;
export type Mode = 'camera' | 'keyboard';
export const DIFFICULTIES = {
  practice: { label: 'Practice trail', description: 'Slow and guided', speed: 8 },
  easy: { label: 'Easy adventure', description: 'A gentle pace', speed: 11 },
  medium: { label: 'Medium adventure', description: 'A faster run', speed: 15 },
  hard: { label: 'Hard adventure', description: 'The fastest trail', speed: 19 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export type JumpGesture = 'jump' | 'hands';
export interface Point {
  x: number;
  y: number;
  visibility: number;
}
export interface Body {
  leftShoulder: Point;
  rightShoulder: Point;
  leftHip: Point;
  rightHip: Point;
  leftFoot: Point;
  rightFoot: Point;
  leftWrist: Point;
  rightWrist: Point;
}
export interface Observation {
  timestamp: number;
  bodies: Body[];
  inferenceMs?: number;
}
export interface Actions {
  lane: Lane;
  jump: boolean;
  duck: boolean;
}
export interface Calibration {
  centerX: number;
  hipY: number;
  shoulderY: number;
  footY: number;
  torso: number;
  feet: boolean;
}
export interface Settings {
  cameraAutoplay: boolean;
  sensitivity: number;
  jumpGesture: JumpGesture;
  difficulty: Difficulty;
  sound: boolean;
  quality: 'high' | 'low';
  poseHz: number;
  lossTimeout: number;
}
export const neutral = (): Actions => ({ lane: 0, jump: false, duck: false });
export const DEFAULT_SETTINGS: Settings = {
  cameraAutoplay: true,
  sensitivity: 1,
  jumpGesture: 'jump',
  difficulty: 'practice',
  sound: true,
  quality: 'high',
  poseHz: 15,
  lossTimeout: 500,
};
