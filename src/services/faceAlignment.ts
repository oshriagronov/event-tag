import * as faceapi from '@vladmandic/face-api';

export function alignFace(
  sourceImage: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  landmarks: faceapi.FaceLandmarks68
): HTMLCanvasElement {
  const leftEyePoints = landmarks.getLeftEye();
  const rightEyePoints = landmarks.getRightEye();

  // 1. Calculate the center of each eye
  const leftEyeCenter = leftEyePoints.reduce(
    (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
    { x: 0, y: 0 }
  );
  leftEyeCenter.x /= leftEyePoints.length;
  leftEyeCenter.y /= leftEyePoints.length;

  const rightEyeCenter = rightEyePoints.reduce(
    (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
    { x: 0, y: 0 }
  );
  rightEyeCenter.x /= rightEyePoints.length;
  rightEyeCenter.y /= rightEyePoints.length;

  // 2. Calculate rotation and scale
  const dx = rightEyeCenter.x - leftEyeCenter.x;
  const dy = rightEyeCenter.y - leftEyeCenter.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Distance between eyes in canonical template: 73.5318 - 38.2946 = 35.2372 px
  const targetEyeDist = 35.2372;
  const scale = targetEyeDist / (dist || 1); // Avoid division by zero

  // Rotation angle in radians
  const angle = Math.atan2(dy, dx);

  // Canonical center of eyes in 112x112 target template:
  // tx = (38.2946 + 73.5318) / 2 = 55.9132
  // ty = (51.6963 + 51.5014) / 2 = 51.59885
  const tx = 55.9132;
  const ty = 51.59885;

  // Current center of eyes in source image
  const cx = (leftEyeCenter.x + rightEyeCenter.x) / 2;
  const cy = (leftEyeCenter.y + rightEyeCenter.y) / 2;

  // 3. Draw onto a 112x112 canvas with affine transformation
  const canvas = document.createElement('canvas');
  canvas.width = 112;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Could not get 2D context for canvas face alignment');
  }

  // Clear canvas to black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 112, 112);

  // Apply transformations
  // Move origin to target center
  ctx.translate(tx, ty);
  // Rotate around target center to align eyes horizontally
  ctx.rotate(-angle);
  // Scale
  ctx.scale(scale, scale);
  // Shift so current eye center maps to target center
  ctx.translate(-cx, -cy);

  // Draw the image
  ctx.drawImage(sourceImage, 0, 0);

  return canvas;
}
