'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fileToImageData } from '@/lib/rendering/canvas';

export type PhotoUploadProps = {
  onImageLoaded: (imageData: ImageData) => void;
};

export function PhotoUpload({ onImageLoaded }: PhotoUploadProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a PNG, JPEG, or WebP image');
      return;
    }
    try {
      const imageData = await fileToImageData(file, 512);
      setFileName(file.name);
      onImageLoaded(imageData);
    } catch (err) {
      setError('Failed to load image');
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      <Label htmlFor="photo-upload">Upload an image</Label>
      <Input id="photo-upload" type="file" accept="image/*" onChange={handleFile} />
      {fileName && <div className="text-xs text-slate-400">Loaded: {fileName}</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}
