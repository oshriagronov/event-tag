import * as faceapi from '@vladmandic/face-api';

type DetectionSource = HTMLImageElement | HTMLCanvasElement;

// SSD MobileNet resizes every input to 512x512, so small faces in group shots
// fall below its resolution. A 2x2 grid of overlapping tiles on top of the
// full-frame pass recovers them (measured: 22 -> 31 of 31 faces on a 3x3 group
// mosaic, no extra faces on regular photos).
const TILE_GRID = 2;
const TILE_OVERLAP = 0.2;
// Below this size tiles would not be larger than the model input anyway.
const MIN_TILING_DIM = 1000;
const MIN_FACE_PX = 16;
// Two boxes are the same face when most of the smaller one lies inside the other
// (a face cut at a tile edge yields a partial box inside the full one).
const DUPLICATE_OVERLAP = 0.5;

let readbackModeInstalled = false;

/**
 * tfjs waits for WebGL results by polling with setTimeout. In a hidden tab
 * Chrome aligns timers to 1s (and to 1 min after 5 min hidden), which stalls a
 * long scan when the organizer switches tabs. While hidden, read results back
 * synchronously instead; while visible, keep the faster non-blocking polling.
 */
export function installBackgroundSafeReadback(): void {
  if (readbackModeInstalled || typeof document === 'undefined') return;
  readbackModeInstalled = true;
  const env = faceapi.tf.ENV;
  let fenceApi: boolean;
  let timerQuery: number;
  try {
    fenceApi = env.getBool('WEBGL_FENCE_API_ENABLED');
    timerQuery = env.getNumber('WEBGL_DISJOINT_QUERY_TIMER_EXTENSION_VERSION');
  } catch (err) {
    // Not on the WebGL backend: nothing to tune.
    console.warn('WebGL readback flags unavailable:', err);
    return;
  }
  const apply = () => {
    const hidden = document.visibilityState === 'hidden';
    env.set('WEBGL_FENCE_API_ENABLED', hidden ? false : fenceApi);
    env.set('WEBGL_DISJOINT_QUERY_TIMER_EXTENSION_VERSION', hidden ? 0 : timerQuery);
  };
  apply();
  document.addEventListener('visibilitychange', apply);
}

function overlapsExisting(box: faceapi.Box, kept: faceapi.FaceDetection[]): boolean {
  return kept.some(({ box: other }) => {
    const w = Math.min(other.right, box.right) - Math.max(other.x, box.x);
    const h = Math.min(other.bottom, box.bottom) - Math.max(other.y, box.y);
    return w > 0 && h > 0 && (w * h) / Math.min(other.area, box.area) > DUPLICATE_OVERLAP;
  });
}

/**
 * Detect all faces with 68-point landmarks, adding overlapping tiles to the
 * full-frame pass so that small faces in large group photos are found too.
 */
export async function detectFacesTiled(source: DetectionSource, minConfidence: number) {
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const options = new faceapi.SsdMobilenetv1Options({ minConfidence });

  const candidates: faceapi.FaceDetection[] = await faceapi.detectAllFaces(source, options);

  if (Math.max(width, height) >= MIN_TILING_DIM) {
    const span = TILE_GRID - (TILE_GRID - 1) * TILE_OVERLAP;
    const tileW = Math.round(width / span);
    const tileH = Math.round(height / span);
    const tile = document.createElement('canvas');
    const ctx = tile.getContext('2d');
    if (ctx) {
      for (let row = 0; row < TILE_GRID; row++) {
        for (let col = 0; col < TILE_GRID; col++) {
          const x = Math.round(col * tileW * (1 - TILE_OVERLAP));
          const y = Math.round(row * tileH * (1 - TILE_OVERLAP));
          tile.width = Math.min(tileW, width - x);
          tile.height = Math.min(tileH, height - y);
          ctx.drawImage(source, x, y, tile.width, tile.height, 0, 0, tile.width, tile.height);
          for (const det of await faceapi.detectAllFaces(tile, options)) {
            const b = det.box;
            candidates.push(new faceapi.FaceDetection(
              det.score,
              new faceapi.Rect((b.x + x) / width, (b.y + y) / height, b.width / width, b.height / height),
              { width, height }
            ));
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const kept: faceapi.FaceDetection[] = [];
  for (const det of candidates) {
    if (det.box.width < MIN_FACE_PX || det.box.height < MIN_FACE_PX) continue;
    if (!overlapsExisting(det.box, kept)) kept.push(det);
  }

  // Same landmark step face-api runs after detectAllFaces(), on the merged boxes.
  return new faceapi.DetectAllFaceLandmarksTask(
    Promise.resolve(kept.map((detection) => ({ detection }))),
    source,
    false
  ).run();
}
