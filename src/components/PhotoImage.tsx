import { useState, useEffect } from 'react';
import { db } from '../db';
import { ShieldAlert } from 'lucide-react';

interface PhotoImageProps {
  photoId: number;
  className?: string;
  alt?: string;
  onLoad?: () => void;
}

export function PhotoImage({ photoId, className = '', alt = '', onLoad }: PhotoImageProps) {
  const [src, setSrc] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let url = '';
    
    async function load() {
      try {
        const photo = await db.photos.get(photoId);
        if (!photo) {
          if (active) setError(true);
          return;
        }

        if (photo.fileHandle) {
          try {
            // Get standard File from local FileSystemFileHandle
            const file = await photo.fileHandle.getFile();
            if (active) {
              url = URL.createObjectURL(file);
              setSrc(url);
            }
          } catch (err: any) {
            console.error("Failed to load file from FileSystemFileHandle", err);
            // This usually means directory permission needs to be re-granted
            if (active) setError(true);
          }
        } else if (photo.fallbackBlob) {
          if (active) {
            url = URL.createObjectURL(photo.fallbackBlob);
            setSrc(url);
          }
        } else {
          if (active) setError(true);
        }
      } catch (err) {
        console.error("Failed to load photo image", err);
        if (active) setError(true);
      }
    }

    load();

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [photoId]);

  if (error) {
    return (
      <div className={`bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-1.5 text-slate-500 p-2 text-center text-xs ${className}`}>
        <ShieldAlert className="w-4 h-4 text-amber-500" />
        <span>שגיאת טעינה (נדרשת הרשאה)</span>
      </div>
    );
  }

  if (!src) {
    return <div className={`bg-slate-900 animate-pulse ${className}`} />;
  }

  return (
    <img
      src={src}
      className={className}
      alt={alt}
      onLoad={onLoad}
      loading="lazy"
    />
  );
}
