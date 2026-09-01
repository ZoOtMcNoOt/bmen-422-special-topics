'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fileToImageData } from '@/lib/rendering/canvas';

type Props = { onImageLoaded: (imageData: ImageData) => void; disabled: boolean };

/** True if any pixel has non-zero luminance — the sampler needs something to sample. */
function hasBrightPixels(img: ImageData): boolean {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i] || img.data[i + 1] || img.data[i + 2]) return true;
  }
  return false;
}

export function PhotoUpload({ onImageLoaded, disabled }: Props) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus({ ok: false, text: 'Please choose a PNG, JPEG, or WebP image.' });
      return;
    }
    try {
      const img = await fileToImageData(file);
      if (!hasBrightPixels(img)) {
        setStatus({ ok: false, text: 'That image is completely black — there is nothing to label.' });
        return;
      }
      onImageLoaded(img);
      setStatus({ ok: true, text: `Loaded ${file.name}` });
    } catch {
      setStatus({ ok: false, text: 'That image could not be read.' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="photo-upload" className="text-sm text-foreground">Image file</Label>
      <Input id="photo-upload" type="file" accept="image/*" onChange={handleFile} disabled={disabled} />
      {status && (
        <p className={`text-xs ${status.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{status.text}</p>
      )}
    </div>
  );
}
