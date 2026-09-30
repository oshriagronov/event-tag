import * as faceapi from '@vladmandic/face-api';
import { getONNXSession } from './onnxModel';
import { installBackgroundSafeReadback } from './faceDetection';

let modelLoadPromise: Promise<void> | null = null;

/**
 * Load the face detection/landmark networks and the SFace ONNX session once.
 * A failed load (e.g. a flaky network) is not cached, so the next call retries.
 */
export function ensureModelsLoaded(): Promise<void> {
  if (!modelLoadPromise) {
    modelLoadPromise = (async () => {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);
      installBackgroundSafeReadback();
      await getONNXSession();
    })().catch((err) => {
      modelLoadPromise = null;
      throw err;
    });
  }
  return modelLoadPromise;
}
