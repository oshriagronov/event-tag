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
        const detections = await faceapi.detectAllFaces(detectionSource);
        if (detections.length > 1) {
          setError(t('selfieCapture.multipleFacesDetected', { count: detections.length }));
        } else {
          setError(t('selfieCapture.noFaceDetected'));
        }
        return;
      }

      // Align and crop face to 112x112
      const alignedCanvas = alignFace(detectionSource, detection.landmarks);

      // Extract SFace vector
      const descriptor = await extractEmbedding(alignedCanvas);

      // Aligned thumbnail
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

  return (
    <div className="w-full max-w-md mx-auto text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Mode Selection */}
      {mode === 'select' && (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={startCamera}
            className="group relative flex items-center gap-4 p-5 rounded bg-surface-container border border-surface-border hover:border-copper-accent/35 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-2xl active:scale-[0.99]"
          >
            <div className="w-11 h-11 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform duration-300">
              <Camera className="w-5 h-5" />
            </div>
            <div className="text-start">
              <span className="block font-bold text-on-background text-base">{t('selfieCapture.takeSelfieTitle')}</span>
              <span className="block font-body-md text-xs text-sage-muted mt-1 leading-normal">
                {t('selfieCapture.takeSelfieDesc')}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex items-center gap-4 p-5 rounded bg-surface-container border border-surface-border hover:border-copper-accent/35 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-2xl active:scale-[0.99]"
          >
            <div className="w-11 h-11 rounded bg-surface-container-high border border-surface-border flex items-center justify-center text-sage-muted shrink-0 group-hover:scale-105 transition-transform duration-300">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-start">
              <span className="block font-bold text-on-background text-base">{t('selfieCapture.uploadGalleryBtn')}</span>
              <span className="block font-body-md text-xs text-sage-muted mt-1 leading-normal">
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

      {/* Camera Live Preview */}
      {mode === 'camera' && (
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-surface-border bg-background flex flex-col justify-end">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          />

          {loading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-copper-accent" />
              <span className="text-xs font-semibold text-sage-muted">{t('selfieCapture.analyzing')}</span>
            </div>
          )}

          {/* HUD buttons */}
          <div className="relative z-10 p-5 bg-gradient-to-t from-background to-transparent flex gap-3 items-center">
            <button
              type="button"
              onClick={handleCapture}
              disabled={loading}
              className="flex-1 py-3 rounded bg-deep-forest hover:bg-primary text-background font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow active:scale-95 disabled:opacity-50 border-none"
            >
              {t('selfieCapture.captureBtn')}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-3 rounded bg-surface-container border border-surface-border hover:bg-surface-container-high text-on-background font-medium text-xs transition-all cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Captured Preview & Verify */}
      {mode === 'preview' && pendingResult && (
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-surface-border bg-background flex flex-col justify-end">
          <img
            src={pendingResult.previewSrc}
            alt="Preview"
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Validation indicators */}
          <div className="absolute top-4 start-4 z-10">
            {validated ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold bg-emerald-500/90 text-white shadow-lg">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('common.success')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-bold bg-copper-accent/90 text-background shadow-lg">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('selfieCapture.analyzing')}
              </span>
            )}
          </div>

          {/* HUD buttons */}
          <div className="relative z-10 p-5 bg-gradient-to-t from-background to-transparent flex gap-3 items-center">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 py-3 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow active:scale-95 border-none"
            >
              {t('common.save')}
            </button>
            <button
              type="button"
              onClick={handleRetake}
              className="p-3 rounded bg-surface-container border border-surface-border text-sage-muted hover:text-on-background transition-all cursor-pointer"
              title={t('selfieCapture.retakeBtn')}
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="p-3 rounded bg-surface-container border border-surface-border text-sage-muted hover:text-on-background transition-all cursor-pointer"
              title={t('common.cancel')}
            >
              <X className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* Model status indicator */}
      {loading && mode === 'select' && (
        <div className="mt-4 flex items-center justify-center gap-2.5 py-3 text-sage-muted bg-surface-container/20 rounded border border-surface-border/50">
          <Loader2 className="w-4 h-4 animate-spin text-copper-accent" />
          <span className="text-xs font-semibold">{t('selfieCapture.analyzing')}</span>
        </div>
      )}

      {/* Errors */}
      {error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded p-4 flex gap-3 text-start">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span className="text-xs text-red-400 font-bold leading-relaxed">
            {error}
          </span>
        </div>
      )}
    </div>
  );
}
