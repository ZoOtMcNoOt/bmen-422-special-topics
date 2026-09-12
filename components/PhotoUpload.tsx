'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fileToImageData, type DecodedImage } from '@/lib/rendering/canvas';
import { imageHasSignal } from '@/lib/simulator/groundTruth';

type Props = {
  onImageLoaded: (image: DecodedImage) => void;
  disabled: boolean;
  decoding: boolean;
  onDecodingChange: (decoding: boolean) => void;
};

export function PhotoUpload({ onImageLoaded, disabled, decoding, onDecodingChange }: Props) {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const request = useRef(0);
  useEffect(() => () => {
    request.current++;
    onDecodingChange(false);
  }, [onDecodingChange]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const current = ++request.current;
    if (!file.type.startsWith('image/')) {
      onDecodingChange(false);
      setStatus({ ok: false, text: 'Please choose a PNG, JPEG, or WebP image.' });
      return;
    }
    onDecodingChange(true);
    setStatus({ ok: true, text: 'Reading image…' });
    try {
      const img = await fileToImageData(file);
      if (current !== request.current) return;
      if (!imageHasSignal(img.pixels)) {
        setStatus({ ok: false, text: 'The image is black or transparent. Choose an image with visible bright pixels.' });
        return;
      }
      onImageLoaded(img);
      setStatus({ ok: true, text: `Loaded ${file.name}` });
    } catch {
      if (current === request.current) setStatus({ ok: false, text: 'That image could not be read.' });
    } finally {
      if (current === request.current) onDecodingChange(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="photo-upload" className="text-sm text-foreground">Image file</Label>
      <Input id="photo-upload" type="file" accept="image/*" onChange={handleFile} disabled={disabled || decoding} />
      <p className="text-xs text-muted-foreground">Bright areas receive labels; black and transparent areas stay empty.</p>
      {status && (
        <p role={status.ok ? 'status' : 'alert'} className={`text-xs ${status.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{status.text}</p>
      )}
    </div>
  );
}
