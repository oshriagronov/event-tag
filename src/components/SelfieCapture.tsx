/**
 * SelfieCapture — Camera + Upload selfie component with face detection
 *
 * Captures or uploads a single selfie, validates exactly one face is present
 * using face-api.js, and returns the 128-dim descriptor + thumbnail.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Camera, Upload, RotateCcw, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface SelfieCaptureProps {
  onCapture: (descriptor: number[], thumbnail: string) => void;
}

type CaptureMode = 'select' | 'camera' | 'preview';

// Singleton model loading state
let modelsLoaded = false;
let modelsLoading = false;
let modelLoadPromise: Promise<void> | null = null;

async function ensureModelsLoaded(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading && modelLoadPromise) return modelLoadPromise;

  modelsLoading = true;
  modelLoadPromise = (async () => {
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    modelsLoading = false;
  })();

  return modelLoadPromise;
}

/**
 * Create a base64 thumbnail from an image, capped at given max dimension.
 */
function createThumbnail(img: HTMLImageElement | HTMLVideoElement, maxSize = 256): string {
  const canvas = document.createElement('canvas');
  const w = img instanceof HTMLVideoElement ? img.videoWidth : img.naturalWidth;
  const h = img instanceof HTMLVideoElement ? img.videoHeight : img.naturalHeight;
  const scale = Math.min(maxSize / w, maxSize / h, 1);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function SelfieCapture({ onCapture }: SelfieCaptureProps) {
  const [mode, setMode] = useState<CaptureMode>('select');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [faceBox, setFaceBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [validated, setValidated] = useState(false);
  const [pendingResult, setPendingResult] = useState<{ descriptor: number[]; thumbnail: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);

  // Cleanup camera stream on unmount or mode change
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  /**
   * Process an image element: detect faces, validate exactly one, extract descriptor.
   */
  const processImage = useCallback(
    async (img: HTMLImageElement | HTMLVideoElement) => {
      setLoading(true);
      setError(null);
      setFaceBox(null);
      setValidated(false);
      setPendingResult(null);

      try {
        setLoadingMessage('טוען מודלים לזיהוי פנים...');
        await ensureModelsLoaded();

        setLoadingMessage('מנתח את התמונה...');
        const detections = await faceapi
          .detectAllFaces(img)
          .withFaceLandmarks()
          .withFaceDescriptors();

        if (detections.length === 0) {
          setError('לא זוהו פנים בתמונה. נסה/י לצלם שוב עם תאורה טובה יותר ופנים גלויים.');
          return;
        }

        if (detections.length > 1) {
          setError(`זוהו ${detections.length} פנים בתמונה. אנא צלם/י סלפי עם פנים אחד בלבד.`);
          return;
        }

        const detection = detections[0];
        const box = detection.detection.box;
        const imgW = img instanceof HTMLVideoElement ? img.videoWidth : img.naturalWidth;
        const imgH = img instanceof HTMLVideoElement ? img.videoHeight : img.naturalHeight;

        // Store relative box for overlay rendering
        setFaceBox({
          x: (box.x / imgW) * 100,
          y: (box.y / imgH) * 100,
          width: (box.width / imgW) * 100,
          height: (box.height / imgH) * 100,
        });

        const descriptor = Array.from(detection.descriptor);
        const thumbnail = createThumbnail(img);

        setPendingResult({ descriptor, thumbnail });
        setValidated(true);
      } catch (err) {
        console.error('Face detection error:', err);
        setError('שגיאה בזיהוי פנים. נסה/י שוב.');
      } finally {
        setLoading(false);
        setLoadingMessage('');
      }
    },
    []
  );

  // ---- Camera flow ----

  const startCamera = useCallback(async () => {
    setMode('camera');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('לא ניתן לגשת למצלמה. ודא/י שהענקת הרשאות מצלמה לאתר זה.');
      setMode('select');
    }
  }, []);

  const captureFromCamera = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d')!;
    // Mirror the image for natural selfie appearance
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    stopCamera();

    setPreviewSrc(dataUrl);
    setMode('preview');

    // Create an image element for face-api processing
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });
    await processImage(img);
  }, [stopCamera, processImage]);

  // ---- File upload flow ----

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('אנא בחר/י קובץ תמונה (JPG, PNG).');
        return;
      }

      // Validate file size (max 15MB)
      if (file.size > 15 * 1024 * 1024) {
        setError('הקובץ גדול מדי. הגודל המרבי הוא 15MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        setPreviewSrc(dataUrl);
        setMode('preview');

        const img = new Image();
        img.src = dataUrl;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
        });
        await processImage(img);
      };
      reader.readAsDataURL(file);

      // Reset file input so re-selecting the same file works
      e.target.value = '';
    },
    [processImage]
  );

  // ---- Confirm & Reset ----

  const handleConfirm = useCallback(() => {
    if (pendingResult) {
      onCapture(pendingResult.descriptor, pendingResult.thumbnail);
    }
  }, [pendingResult, onCapture]);

  const handleReset = useCallback(() => {
    stopCamera();
    setMode('select');
    setPreviewSrc(null);
    setFaceBox(null);
    setError(null);
    setValidated(false);
    setPendingResult(null);
    setLoading(false);
  }, [stopCamera]);

  // ---- Render ----

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Mode: Select camera or upload */}
      {mode === 'select' && (
        <div className="flex flex-col gap-4">
          <button
            onClick={startCamera}
            className="group relative flex items-center gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-amber-300 dark:hover:border-amber-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-lg active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-200 to-amber-400 dark:from-amber-500 dark:to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 dark:shadow-amber-600/30 shrink-0">
              <Camera className="w-6 h-6 text-amber-900 dark:text-white" />
            </div>
            <div className="text-right">
              <span className="block font-bold text-slate-800 dark:text-slate-100 text-base">צלם סלפי</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                צלם/י תמונת סלפי באמצעות המצלמה
              </span>
            </div>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex items-center gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-amber-300 dark:hover:border-amber-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-lg active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center shadow-lg shadow-slate-500/10 dark:shadow-slate-600/20 shrink-0">
              <Upload className="w-6 h-6 text-slate-600 dark:text-slate-200" />
            </div>
            <div className="text-right">
              <span className="block font-bold text-slate-800 dark:text-slate-100 text-base">העלה תמונה</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                בחר/י תמונת סלפי מהגלריה
              </span>
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Mode: Camera viewfinder */}
      {mode === 'camera' && (
        <div className="flex flex-col gap-4">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4] shadow-xl">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-[15%] border-2 border-white/30 rounded-full" />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm transition-all hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer active:scale-[0.98]"
            >
              <X className="w-4 h-4" />
              ביטול
            </button>
            <button
              onClick={captureFromCamera}
              className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all shadow-lg shadow-amber-500/30 cursor-pointer active:scale-[0.98]"
            >
              <Camera className="w-4 h-4" />
              צלם
            </button>
          </div>
        </div>
      )}

      {/* Mode: Preview with face detection */}
      {mode === 'preview' && previewSrc && (
        <div className="flex flex-col gap-4">
          <div className="relative rounded-2xl overflow-hidden bg-black shadow-xl">
            <img
              ref={previewImgRef}
              src={previewSrc}
              alt="תצוגה מקדימה של סלפי"
              className="w-full block"
            />

            {/* Face detection overlay */}
            {faceBox && (
              <div
                className="absolute border-2 rounded-lg transition-all duration-500"
                style={{
                  left: `${faceBox.x}%`,
                  top: `${faceBox.y}%`,
                  width: `${faceBox.width}%`,
                  height: `${faceBox.height}%`,
                  borderColor: validated ? '#22c55e' : '#f59e0b',
                  boxShadow: validated
                    ? '0 0 12px rgba(34, 197, 94, 0.4)'
                    : '0 0 12px rgba(245, 158, 11, 0.4)',
                }}
              />
            )}

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                <span className="text-white text-sm font-medium">{loadingMessage}</span>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm leading-relaxed">{error}</span>
            </div>
          )}

          {/* Success message */}
          {validated && !error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm leading-relaxed">זוהו פנים בהצלחה! לחץ/י על &quot;אישור&quot; להמשך.</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm transition-all hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer active:scale-[0.98]"
            >
              <RotateCcw className="w-4 h-4" />
              צלם שוב
            </button>
            {validated && (
              <button
                onClick={handleConfirm}
                className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all shadow-lg shadow-amber-500/30 cursor-pointer active:scale-[0.98]"
              >
                <CheckCircle2 className="w-4 h-4" />
                אישור
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hidden canvas for camera capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
