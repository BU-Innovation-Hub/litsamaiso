import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

type Props = {
  images: string[];
  startIndex?: number;
  onClose?: () => void;
};

export default function Lightbox({ images, startIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft') setIndex((i) => (i > 0 ? i - 1 : i));
      if (e.key === 'ArrowRight') setIndex((i) => (i < images.length - 1 ? i + 1 : i));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  if (!images || images.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative max-w-4xl w-full mx-4">
        <button onClick={() => onClose?.()} className="absolute right-2 top-2 text-white p-2 rounded-full bg-black/30">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center justify-center">
          <button onClick={() => setIndex((i) => Math.max(0, i - 1))} className="text-white p-2 hidden md:inline">
            <ChevronLeft className="w-8 h-8" />
          </button>

          <img src={images[index]} alt={`proof-${index}`} className="max-h-[80vh] w-auto mx-auto object-contain rounded-md" />

          <button onClick={() => setIndex((i) => Math.min(images.length - 1, i + 1))} className="text-white p-2 hidden md:inline">
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>

        {images.length > 1 && (
          <div className="mt-3 text-center text-white">
            <span className="text-sm">{index + 1} / {images.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}
