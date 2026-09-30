/**
 * SelfieCapture — Camera + Upload selfie component with face detection
 *
 * Captures or uploads a single selfie, validates exactly one face is present
 * using face-api.js, and returns the 128-dim descriptor + thumbnail.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Camera, Upload, RotateCcw, Loader2, AlertCircle, CheckCircle2, X, Sparkles } from 'lucide-react';
import { useTranslation } from '../services/translations';
import { extractEmbedding } from '../services/onnxModel';
import { ensureModelsLoaded } from '../services/modelLoader';
import { alignFace } from '../services/faceAlignment';

interface SelfieCaptureProps {
  onCapture: (descriptor: number[], thumbnail: string) => void;
}

type CaptureMode = 'select' | 'camera' | 'preview';

const SELFIE_MIN_CONFIDENCE = 0.38;
const SELFIE_MAX_DIM = 1024;
// Orientations tried when no face is found upright (phone held sideways and
// no EXIF orientation available).
const FALLBACK_ROTATIONS = [90, 270, 180] as const;

type FaceSource = HTMLVideoElement | HTMLCanvasElement;

/** Draw a source onto a canvas, downscaled to SELFIE_MAX_DIM and rotated. */
function toCanvas(source: CanvasImageSource, width: number, height: number, rotation = 0): HTMLCanvasElement {
  const scale = Math.min(1, SELFIE_MAX_DIM / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const sideways = rotation === 90 || rotation === 270;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  return canvas;
}

async function detectFaces(source: FaceSource) {
  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: SELFIE_MIN_CONFIDENCE });
  return faceapi.detectAllFaces(source, options).withFaceLandmarks();
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(max-width: 768px)').matches ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

export function SelfieCapture({ onCapture }: SelfieCaptureProps) {
  const { t, isRtl } = useTranslation();
  
  const [mode, setMode] = useState<CaptureMode>('select');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validated, setValidated] = useState(false);
  
  // Camera streams & file inputs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);

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
    source: HTMLVideoElement | ImageBitmap,
    originalSrc?: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      await ensureModelsLoaded();

      const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

      // Try upright first, then the other orientations
      let detectionSource: FaceSource = toCanvas(source, width, height);
      let detections = await detectFaces(detectionSource);
      if (source instanceof ImageBitmap) {
        for (const rotation of FALLBACK_ROTATIONS) {
          if (detections.length > 0) break;
          detectionSource = toCanvas(source, width, height, rotation);
          detections = await detectFaces(detectionSource);
        }
      }

      if (detections.length === 0) {
        setError(t('selfieCapture.noFaceDetected'));
        return;
      }

      // With several faces, accept the selfie only when one face clearly
      // dominates (e.g. people in the background); otherwise ask for a retake.
      const byArea = [...detections].sort(
        (a, b) => b.detection.box.area - a.detection.box.area
      );
      if (byArea.length > 1 && byArea[0].detection.box.area < byArea[1].detection.box.area * 1.5) {
        setError(t('selfieCapture.multipleFacesDetected', { count: detections.length }));
        return;
      }
      const detection = byArea[0];

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
    const input = e.target;
    const file = input.files?.[0];
    // Reset so choosing the same file again still triggers a change event
    input.value = '';
    if (!file) return;

    setError(null);
    setLoading(true);

    let bitmap: ImageBitmap | null = null;
    try {
      // Applies the EXIF orientation so portrait phone photos are upright
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const previewCanvas = toCanvas(bitmap, bitmap.width, bitmap.height);
      await processSelfieImage(bitmap, previewCanvas.toDataURL('image/jpeg', 0.9));
    } catch (err) {
      console.error('Failed to read selfie image:', err);
      setError(t('selfieCapture.noFaceDetected'));
      setLoading(false);
    } finally {
      bitmap?.close();
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
    setLoading(false);
  };

  const handleTakeSelfie = () => {
    if (isMobileDevice()) {
      cameraFileInputRef.current?.click();
    } else {
      startCamera();
    }
  };

  const handleRetake = () => {
    setError(null);
    setValidated(false);
    setPendingResult(null);
    handleTakeSelfie();
  };

  return (
    <div className="w-full max-w-2xl mx-auto text-start" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Mode Selection */}
      {mode === 'select' && (
        <div className="flex flex-col gap-6">
          <div className="w-full flex flex-col gap-6">
            {/* Card 1: Take Selfie */}
            <button
              type="button"
              onClick={handleTakeSelfie}
              className="group w-full bg-surface-container border border-sage-muted/20 hover:border-copper-accent/40 rounded-xl p-8 flex flex-col items-center justify-center gap-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(26,47,43,0.06)] relative overflow-hidden text-center cursor-pointer active:scale-[0.99]"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface-container-high/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="h-20 w-20 rounded-lg bg-surface-container-highest/60 backdrop-blur-sm border border-sage-muted/10 text-on-surface flex items-center justify-center z-10 group-hover:text-copper-accent transition-colors duration-300">
                <Camera className="w-10 h-10 shrink-0" />
              </div>
              <div className="text-center z-10">
                <h2 className="font-display-lg text-2xl text-on-surface mb-2 font-medium">
                  {t('selfieCapture.takeSelfieTitle')}
                </h2>
                <p className="font-body-md text-sm text-sage-muted m-0">
                  {t('selfieCapture.takeSelfieDesc')}
                </p>
              </div>
            </button>

            {/* Card 2: Upload Gallery */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group w-full bg-surface-container border border-sage-muted/20 hover:border-copper-accent/40 rounded-xl p-8 flex flex-col items-center justify-center gap-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(26,47,43,0.06)] relative overflow-hidden text-center cursor-pointer active:scale-[0.99]"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface-container-high/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="h-20 w-20 rounded-lg bg-surface-container-highest/60 backdrop-blur-sm border border-sage-muted/10 text-on-surface flex items-center justify-center z-10 group-hover:text-copper-accent transition-colors duration-300">
                <Upload className="w-10 h-10 shrink-0" />
              </div>
              <div className="text-center z-10">
                <h2 className="font-display-lg text-2xl text-on-surface mb-2 font-medium">
                  {t('selfieCapture.uploadGalleryBtn')}
                </h2>
                <p className="font-body-md text-sm text-sage-muted m-0">
                  {t('selfieCapture.selectDeviceBtn')}
                </p>
              </div>
            </button>
          </div>

          <input
            type="file"
            ref={cameraFileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            capture="user"
            className="hidden"
          />

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*"
            className="hidden"
          />

          {/* Tips box for best photo results */}
          <div className="w-full mt-2 p-5 rounded-xl bg-surface-container-high/60 backdrop-blur-sm border border-sage-muted/10 text-start font-body-md shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-copper-accent font-bold text-xs uppercase tracking-wider">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{t('selfieCapture.tipsTitle')}</span>
            </div>
            <ul className="space-y-2 text-xs text-sage-muted list-disc list-inside ps-0.5 m-0 leading-relaxed">
              <li>{t('selfieCapture.tipLighting')}</li>
              <li>{t('selfieCapture.tipCenter')}</li>
              <li>{t('selfieCapture.tipObstructions')}</li>
              <li className="font-semibold text-on-surface/90">{t('selfieCapture.tipMultipleTries')}</li>
            </ul>
          </div>
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
              {t('common.search')}
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
