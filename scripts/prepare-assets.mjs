import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'public/vision');
await mkdir(dir, { recursive: true });
const url =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const lockPath = path.join(root, 'scripts/vision-assets.lock.json');
let lock;
try {
  lock = JSON.parse(await readFile(lockPath, 'utf8'));
} catch {
  if (!process.argv.includes('--record'))
    throw new Error('Asset checksum lock missing. Maintainer must record and review it.');
}
const hash = (b) => createHash('sha256').update(b).digest('hex');
let model;
try {
  model = await readFile(path.join(dir, 'pose_landmarker_lite.task'));
} catch {
  /* download below */
}
if (!model || (lock && hash(model) !== lock.model.sha256)) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `Model download failed (${response.status}). Retry npm run assets with internet access.`,
    );
  model = Buffer.from(await response.arrayBuffer());
}
if (lock && hash(model) !== lock.model.sha256)
  throw new Error('Model checksum mismatch. Refusing unreviewed model.');
await writeFile(path.join(dir, 'pose_landmarker_lite.task'), model);
const files = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];
const sums = {};
for (const file of files) {
  const source = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm', file);
  const bytes = await readFile(source);
  sums[file] = hash(bytes);
  if (lock && lock.wasm[file] !== sums[file]) throw new Error(`WASM checksum mismatch: ${file}`);
  await copyFile(source, path.join(dir, file));
}
if (!lock)
  await writeFile(
    lockPath,
    JSON.stringify(
      { package: '@mediapipe/tasks-vision@1.1.1', model: { url, sha256: hash(model) }, wasm: sums },
      null,
      2,
    ) + '\n',
  );
await mkdir(path.join(root, 'public/licenses'), { recursive: true });
for (const file of ['MEDIAPIPE-APACHE-2.0.txt', 'PHASER-MIT.txt']) {
  await copyFile(path.join(root, 'licenses', file), path.join(root, 'public/licenses', file));
}
await copyFile(
  path.join(root, 'THIRD_PARTY_NOTICES.md'),
  path.join(root, 'public/licenses/THIRD_PARTY_NOTICES.md'),
);
console.log('Local model and WASM verified. Licenses packaged.');
