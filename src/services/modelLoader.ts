import * as faceapi from '@vladmandic/face-api';
import { getONNXSession } from './onnxModel';

export let modelsLoaded = false;
let modelsLoading = false;
let modelLoadPromise: Promise<void> | null = null;

export async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading && modelLoadPromise) return modelLoadPromise;

  modelsLoading = true;
  modelLoadPromise = (async () => {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    ]);
    // Initialize the SFace ONNX session
    await getONNXSession();
    modelsLoaded = true;
    modelsLoading = false;
  })();

  return modelLoadPromise;
}
