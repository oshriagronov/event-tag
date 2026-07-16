import * as ort from 'onnxruntime-web';

let sessionPromise: Promise<ort.InferenceSession> | null = null;

export async function getONNXSession(): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const modelUrl = '/models/mobilefacenet.onnx';
    // Use WASM for 100% stability and correctness. SFace runs extremely fast on WASM.
    const session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
    });
    console.log('ONNX SFace Session initialized. Inputs:', session.inputNames, 'Outputs:', session.outputNames);
    return session;
  })();

  return sessionPromise;
}

export function preprocessFaceCanvas(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from aligned face canvas');

  const imgData = ctx.getImageData(0, 0, 112, 112);
  const data = imgData.data; // RGBA array

  const numPixels = 112 * 112;
  const floatData = new Float32Array(3 * numPixels);

  // SFace model expects NCHW layout, and RGB channel order.
  // The ONNX model performs (pixel - 127.5) / 128.0 normalization internally, so we feed raw [0, 255] values.
  for (let i = 0; i < numPixels; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    // RGB planar layout, raw 0-255 values
    floatData[0 * numPixels + i] = r; // Red plane
    floatData[1 * numPixels + i] = g; // Green plane
    floatData[2 * numPixels + i] = b; // Blue plane
  }

  return floatData;
}

function l2Normalize(vector: Float32Array): number[] {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) {
    sum += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sum);
  const result = new Array(vector.length);
  if (norm === 0) {
    for (let i = 0; i < vector.length; i++) result[i] = vector[i];
    return result;
  }
  for (let i = 0; i < vector.length; i++) {
    result[i] = vector[i] / norm;
  }
  return result;
}

export async function extractEmbedding(alignedCanvas: HTMLCanvasElement): Promise<number[]> {
  const session = await getONNXSession();
  const floatData = preprocessFaceCanvas(alignedCanvas);

  // Input shape: [1, 3, 112, 112]
  const inputTensor = new ort.Tensor('float32', floatData, [1, 3, 112, 112]);
  
  // Feed SFace input tensor
  const feeds = { [session.inputNames[0]]: inputTensor };
  const outputs = await session.run(feeds);
  
  // Read SFace output tensor
  const outputTensor = outputs[session.outputNames[0]];
  const rawEmbedding = outputTensor.data as Float32Array;

  // Return L2-normalized embedding
  return l2Normalize(rawEmbedding);
}
export function warmUpONNX(): void {
  getONNXSession().catch((err) => {
    console.error('Failed to pre-load or warm up ONNX SFace model:', err);
  });
}
