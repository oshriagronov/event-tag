import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let modelPromise: Promise<void> | null = null;

// Loads all three required face-api networks from the local /models folder
export function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return Promise.resolve();
  if (modelPromise) return modelPromise;

  modelPromise = (async () => {
    const modelUrl = '/models';
    await faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl);
    await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
    await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
    modelsLoaded = true;
  })();

  return modelPromise;
}

// Utility to convert a file or Blob into an HTMLImageElement
export function fileToImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

// Resizes an HTMLImageElement to a canvas with a max dimension (maintaining aspect ratio)
export function resizeImage(img: HTMLImageElement, maxDim = 1200): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  
  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }
  
  canvas.width = w;
  canvas.height = h;
  ctx?.drawImage(img, 0, 0, w, h);
  return canvas;
}

// Crops a region of an image/canvas and outputs it as a 150x150 JPEG Base64 URL
export function cropFace(
  img: HTMLCanvasElement | HTMLImageElement,
  box: { x: number; y: number; width: number; height: number },
  padding = 0.20 // 20% padding to capture headshot nicely
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  canvas.width = 150;
  canvas.height = 150;

  const padX = box.width * padding;
  const padY = box.height * padding;

  let sx = box.x - padX;
  let sy = box.y - padY;
  let sw = box.width + padX * 2;
  let sh = box.height + padY * 2;

  const naturalWidth = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const naturalHeight = 'naturalHeight' in img ? img.naturalHeight : img.height;

  if (sx < 0) sx = 0;
  if (sy < 0) sy = 0;
  if (sx + sw > naturalWidth) sw = naturalWidth - sx;
  if (sy + sh > naturalHeight) sh = naturalHeight - sy;

  ctx.drawImage(
    img,
    sx, sy, sw, sh,
    0, 0, 150, 150
  );

  return canvas.toDataURL('image/jpeg', 0.85);
}

export interface DetectionResult {
  box: {
    x: number; // normalized between 0 and 1
    y: number; // normalized between 0 and 1
    width: number; // normalized between 0 and 1
    height: number; // normalized between 0 and 1
  };
  embedding: number[];
  thumbnail: string;
}

// Processes a full image element, running face detection and encoding
export async function detectFacesInImage(
  img: HTMLImageElement
): Promise<DetectionResult[]> {
  await loadFaceModels();

  // Resize to a maximum of 1200px for speed and memory efficiency
  const maxInferenceDim = 1200;
  const processingCanvas = resizeImage(img, maxInferenceDim);
  
  // Use strict face detection confidence threshold to ignore noisy/blurry false detections
  const detectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.72 });

  const detections = await faceapi.detectAllFaces(processingCanvas, detectionOptions)
    .withFaceLandmarks()
    .withFaceDescriptors();

  const width = processingCanvas.width;
  const height = processingCanvas.height;

  const results: DetectionResult[] = [];
  for (const det of detections) {
    const box = det.detection.box;
    
    // Ignore small background faces (less than 45px in width or height)
    // This dramatically reduces noise and duplicate unidentified clusters.
    if (box.width < 45 || box.height < 45) {
      continue;
    }

    // Bounding box coordinates normalized (0.0 to 1.0)
    const normalizedBox = {
      x: box.x / width,
      y: box.y / height,
      width: box.width / width,
      height: box.height / height,
    };

    // Crop face from the resized canvas using absolute bounding box
    const thumbnail = cropFace(processingCanvas, box);

    // Convert Float32Array from face-api to serializable number array
    const embedding = Array.from(det.descriptor);

    results.push({
      box: normalizedBox,
      embedding,
      thumbnail,
    });
  }

  return results;
}
