/**
 * SelfieCapture — Camera + Upload selfie component with face detection
 *
 * Captures or uploads a single selfie, validates exactly one face is present
 * using face-api.js, and returns the 128-dim descriptor + thumbnail.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Camera, Upload, RotateCcw, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useTranslation } from '../services/translations';
import { getONNXSession, extractEmbedding } from '../services/onnxModel';
import { alignFace } from '../services/faceAlignment';

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
    ]);
    // Initialize the SFace ONNX session
    await getONNXSession();
    modelsLoaded = true;
    modelsLoading = false;
  })();

  return modelLoadPromise;
}


export function SelfieCapture({ onCapture }: SelfieCaptureProps) {
  const { t, isRtl } = useTranslation();
  
  const [mode, setMode] = useState<CaptureMode>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);
  
  // Camera streams
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Validation result
  const [pendingResult, setPendingResult] = useState<{
    descriptor: number[];
    thumbnail: string;
    previewSrc: string;
  } | null>(null);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = async () => {
    setError(null);
    setLoading(true);
    setMode('camera');

    try {
      await ensureModelsLoaded();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera open failed:', err);
      setError(t('selfieCapture.cameraUnavailable'));
      setMode('select');
      stopCamera();
    } finally {
      setLoading(false);
    }
  };

  const processSelfieImage = async (
    imageElement: HTMLImageElement | HTMLVideoElement,
    originalSrc?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      await ensureModelsLoaded();

      // Downscale image if it is too large to prevent out-of-memory crashes on mobile browsers
      const maxDim = 1024;
      let detectionSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement = imageElement;
      
      if (imageElement instanceof HTMLImageElement) {
        const w = imageElement.naturalWidth;
        const h = imageElement.naturalHeight;
        if (Math.max(w, h) > maxDim) {
          const scale = maxDim / Math.max(w, h);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
            detectionSource = canvas;
          }
        }
      }

      // Find face landmarks
      const detection = await faceapi
        .detectSingleFace(detectionSource)
        .withFaceLandmarks();

      if (!detection) {
        // Run general face count check if single detection failed, to give specific error
        const detections = await faceapi.detectAllFaces(detectionSource);
        if (detections.length > 1) {
          setError(t('selfieCapture.multipleFacesDetected', { count: detections.length }));
        } else {
          setError(t('selfieCapture.noFaceDetected'));
        }
        return;
      }

      // Align and crop the face using landmarks to 112x112
      const alignedCanvas = alignFace(detectionSource, detection.landmarks);

      // Extract embedding using SFace ONNX model (referred to as descriptor downstream)
      const descriptor = await extractEmbedding(alignedCanvas);

      // Generate base64 thumbnail from the aligned face
      const thumbnail = alignedCanvas.toDataURL('image/jpeg', 0.85);
      const previewSrc = originalSrc || thumbnail;

      setPendingResult({ descriptor, thumbnail, previewSrc });
      setValidated(true);
      setMode('preview');
      stopCamera();
    } catch (err) {
      console.error('Face detection failed:', err);
      setError(t('selfieCapture.noFaceDetected'));
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !streamRef.current) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    let originalSrc = '';
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      originalSrc = canvas.toDataURL('image/jpeg', 0.95);
    }
    
    await processSelfieImage(video, originalSrc || undefined);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const originalSrc = event.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        await processSelfieImage(img, originalSrc);
      };
      img.onerror = () => {
        setError(t('selfieCapture.noFaceDetected'));
        setLoading(false);
      };
      img.src = originalSrc;
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    if (pendingResult) {
      onCapture(pendingResult.descriptor, pendingResult.thumbnail);
    }
  };

  const handleCancel = () => {
    stopCamera();
    setMode('select');
    setError(null);
    setValidated(false);
    setPendingResult(null);
    setLoading(false);
  };

  const handleRetake = () => {
    setError(null);
    setValidated(false);
    setPendingResult(null);
    startCamera();
  };

  // ---- Render ----

  return (
    <div className="w-full max-w-md mx-auto text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Mode: Select camera or upload */}
      {mode === 'select' && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={startCamera}
            className="group relative flex items-center gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-amber-300 dark:hover:border-amber-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-lg active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-200 to-amber-400 dark:from-amber-500 dark:to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 dark:shadow-amber-600/30 shrink-0">
              <Camera className="w-6 h-6 text-amber-900 dark:text-white" />
            </div>
            <div className="text-start">
              <span className="block font-bold text-slate-800 dark:text-slate-100 text-base">{t('selfieCapture.takeSelfieTitle')}</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {t('selfieCapture.takeSelfieDesc')}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex items-center gap-4 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-amber-300 dark:hover:border-amber-500/40 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-lg active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center shadow-lg shadow-slate-500/10 dark:shadow-slate-600/20 shrink-0">
              <Upload className="w-6 h-6 text-slate-600 dark:text-slate-200" />
            </div>
            <div className="text-start">
              <span className="block font-bold text-slate-800 dark:text-slate-100 text-base">{t('selfieCapture.uploadGalleryBtn')}</span>
              <span className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {t('selfieCapture.selectDeviceBtn')}
              </span>
            </div>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />
        </div>
      )}

      {/* Mode: Camera Live Stream */}
      {mode === 'camera' && (
        <div className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex flex-col justify-end">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          />

          {loading && (
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
              <span className="text-sm font-semibold text-slate-200">{t('selfieCapture.analyzing')}</span>
            </div>
          )}

          {/* Action HUD */}
          <div className="relative z-10 p-5 bg-gradient-to-t from-slate-950 to-transparent flex gap-3 items-center">
            <button
              type="button"
              onClick={handleCapture}
              disabled={loading}
              className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-sm transition-all cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
            >
              {t('selfieCapture.captureBtn')}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition-all cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Mode: Preview & Validate */}
      {mode === 'preview' && pendingResult && (
        <div className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex flex-col justify-end">
          <img
            src={pendingResult.previewSrc}
            alt="Preview"
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Status Badge overlay */}
          <div className="absolute top-4 start-4 z-10">
            {validated ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-lg">
                <CheckCircle2 className="w-4 h-4" />
                {t('common.success')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500 text-white shadow-lg">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('selfieCapture.analyzing')}
              </span>
            )}
          </div>

          {/* Action HUD */}
          <div className="relative z-10 p-5 bg-gradient-to-t from-slate-950 to-transparent flex gap-3 items-center">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-450 text-white font-bold text-sm transition-all cursor-pointer shadow-lg active:scale-95"
            >
              {t('common.save')}
            </button>
            <button
              type="button"
              onClick={handleRetake}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              title={t('selfieCapture.retakeBtn')}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              title={t('common.cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Loading global spinner */}
      {loading && mode === 'select' && (
        <div className="mt-4 flex items-center justify-center gap-3 py-4 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          <span className="text-sm font-semibold">{t('selfieCapture.analyzing')}</span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex gap-3 text-start">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <span className="text-sm text-red-600 dark:text-red-400 leading-relaxed font-medium">
            {error}
          </span>
        </div>
      )}
    </div>
  );
}
