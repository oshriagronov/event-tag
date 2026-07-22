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
import { extractEmbedding } from '../services/onnxModel';
import { alignFace } from '../services/faceAlignment';

interface SelfieCaptureProps {
  onCapture: (descriptor: number[], thumbnail: string) => void;
}

type CaptureMode = 'select' | 'camera' | 'preview';

import { ensureModelsLoaded } from '../services/modelLoader';

/**
 * Helper to rotate a canvas by 90, 180, or 270 degrees
 */
function rotateCanvas(
  source: HTMLCanvasElement | HTMLImageElement,
  degree: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const srcWidth = source instanceof HTMLImageElement ? source.naturalWidth || source.width : source.width;
  const srcHeight = source instanceof HTMLImageElement ? source.naturalHeight || source.height : source.height;

  if (degree === 90 || degree === 270) {
    canvas.width = srcHeight;
    canvas.height = srcWidth;
  } else {
    canvas.width = srcWidth;
    canvas.height = srcHeight;
  }

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degree * Math.PI) / 180);
    ctx.drawImage(source, -srcWidth / 2, -srcHeight / 2);
  }
  return canvas;
}

/**
 * Helper to load a File/Blob into an upright HTMLCanvasElement with EXIF orientation auto-corrected
 */
async function loadOrientedCanvas(
  file: File
): Promise<{ canvas: HTMLCanvasElement; originalSrc: string }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        const originalSrc = canvas.toDataURL('image/jpeg', 0.95);
        return { canvas, originalSrc };
      }
    } catch {
      // Fall back to FileReader + Image if createImageBitmap fails
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        resolve({ canvas: c, originalSrc: dataUrl });
      };
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

  // Validation result & captured frame snapshot
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<{
    descriptor: number[];
    thumbnail: string;
    previewSrc: string;
  } | null>(null);

  // Eagerly pre-load AI models on mount so selfie capture & upload feel instant
  useEffect(() => {
    ensureModelsLoaded().catch((err) => {
      console.error('Failed to pre-load face models:', err);
    });
  }, []);

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
    setCapturedFrame(null);
    setMode('camera');

    try {
      await ensureModelsLoaded();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
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
    imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    originalSrc?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      await ensureModelsLoaded();

      // Downscale image if it is too large to prevent out-of-memory crashes on mobile browsers
      const maxDim = 1024;
      let detectionSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement = imageElement;
      
      const rawW = imageElement instanceof HTMLImageElement
        ? imageElement.naturalWidth || imageElement.width
        : imageElement instanceof HTMLCanvasElement
        ? imageElement.width
        : imageElement.videoWidth;
      const rawH = imageElement instanceof HTMLImageElement
        ? imageElement.naturalHeight || imageElement.height
        : imageElement instanceof HTMLCanvasElement
        ? imageElement.height
        : imageElement.videoHeight;

      if (rawW > 0 && rawH > 0 && Math.max(rawW, rawH) > maxDim) {
        const scale = maxDim / Math.max(rawW, rawH);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rawW * scale);
        canvas.height = Math.round(rawH * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
          detectionSource = canvas;
        }
      }

      // Use calibrated confidence threshold suitable for mobile selfies (0.38)
      const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.38 });

      // Primary face detection
      let detection = await faceapi
        .detectSingleFace(detectionSource, options)
        .withFaceLandmarks();

      let finalSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement = detectionSource;

      // Rotational fallbacks for photos taken sideways or with missing EXIF metadata
      if (!detection && (detectionSource instanceof HTMLCanvasElement || detectionSource instanceof HTMLImageElement)) {
        for (const degree of [90, 270, 180]) {
          const rotated = rotateCanvas(detectionSource, degree);
          const rotDetection = await faceapi
            .detectSingleFace(rotated, options)
            .withFaceLandmarks();
          if (rotDetection) {
            detection = rotDetection;
            finalSource = rotated;
            break;
          }
        }
      }

      if (!detection) {
        setCapturedFrame(null);
        const detections = await faceapi.detectAllFaces(finalSource, options);
        if (detections.length > 1) {
          setError(t('selfieCapture.multipleFacesDetected', { count: detections.length }));
        } else {
          setError(t('selfieCapture.noFaceDetected'));
        }
        return;
      }

      // Align and crop face to 112x112
      const alignedCanvas = alignFace(finalSource, detection.landmarks);

      // Extract SFace vector
      const descriptor = await extractEmbedding(alignedCanvas);

      // Aligned thumbnail
      const thumbnail = alignedCanvas.toDataURL('image/jpeg', 0.85);
      const previewSrc = originalSrc || (finalSource instanceof HTMLCanvasElement ? finalSource.toDataURL('image/jpeg', 0.95) : thumbnail);

      setPendingResult({ descriptor, thumbnail, previewSrc });
      setValidated(true);
      setMode('preview');
      setCapturedFrame(null);
      stopCamera();
    } catch (err) {
      console.error('Face detection failed:', err);
      setCapturedFrame(null);
      setError(t('selfieCapture.noFaceDetected'));
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !streamRef.current || loading) return;
    
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
    
    // Instantly freeze camera preview with the captured snapshot image
    setCapturedFrame(originalSrc);
    setLoading(true);
    setError(null);

    // Pass the captured canvas frame directly for instant face processing
    await processSelfieImage(canvas, originalSrc || undefined);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);
    setCapturedFrame(null);

    try {
      const { canvas, originalSrc } = await loadOrientedCanvas(file);
      await processSelfieImage(canvas, originalSrc);
    } catch (err) {
      console.error('Error loading uploaded image file:', err);
      setError(t('selfieCapture.noFaceDetected'));
      setLoading(false);
    }
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
    setCapturedFrame(null);
    setLoading(false);
  };

  const handleRetake = () => {
    setError(null);
    setValidated(false);
    setPendingResult(null);
    setCapturedFrame(null);
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

      {/* Camera Live Preview & Captured Snapshot */}
      {mode === 'camera' && (
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-surface-border bg-background flex flex-col justify-end">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          />

          {/* Instant Frozen Snapshot Preview when user taps Capture */}
          {capturedFrame && (
            <img
              src={capturedFrame}
              alt="Captured Snapshot"
              className="absolute inset-0 w-full h-full object-cover z-10"
            />
          )}

          {/* Processing Overlay */}
          {loading && (
            <div className="absolute inset-0 z-20 bg-background/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-9 h-9 animate-spin text-copper-accent" />
              <span className="text-xs font-bold text-on-background tracking-wider uppercase">
                {t('selfieCapture.processing')}
              </span>
            </div>
          )}

          {/* HUD buttons */}
          <div className="relative z-30 p-5 bg-gradient-to-t from-background via-background/60 to-transparent flex gap-3 items-center">
            <button
              type="button"
              onClick={handleCapture}
              disabled={loading}
              className="flex-1 py-3.5 rounded bg-deep-forest hover:bg-primary text-background font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow active:scale-95 disabled:opacity-80 disabled:cursor-not-allowed border-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{t('selfieCapture.processing')}</span>
                </>
              ) : (
                <span>{t('selfieCapture.captureBtn')}</span>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="px-5 py-3.5 rounded bg-surface-container border border-surface-border hover:bg-surface-container-high text-on-background font-medium text-xs transition-all cursor-pointer disabled:opacity-50"
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

      {/* Errors & Tips */}
      {error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/25 rounded-lg p-4 flex flex-col gap-3 text-start shadow-sm">
          <div className="flex gap-3 items-start">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="text-xs text-red-400 font-bold leading-relaxed">
              {error}
            </span>
          </div>

          {/* Actionable Tips Box */}
          <div className="pt-3 border-t border-red-500/15 text-start text-xs space-y-2">
            <span className="font-bold text-on-background block text-[11px]">
              {t('selfieCapture.tipsTitle')}
            </span>
            <ul className="space-y-1.5 text-sage-muted font-body-md text-[11px] leading-relaxed list-none p-0 m-0">
              <li className="flex items-start gap-2">
                <span className="shrink-0 text-copper-accent">💡</span>
                <span>{t('selfieCapture.tipLighting')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 text-copper-accent">👤</span>
                <span>{t('selfieCapture.tipCenter')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 text-copper-accent">🕶️</span>
                <span>{t('selfieCapture.tipObstructions')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 text-copper-accent">📱</span>
                <span>{t('selfieCapture.tipHoldSteady')}</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
