'use client';

import { Button } from '@/components/ui/button';
import { PRESETS, PRESET_KINDS, type PresetKind } from '@/lib/presets';
import { PhotoUpload } from './PhotoUpload';

type Props = {
  value: PresetKind;
  onChange: (kind: PresetKind) => void;
  onImageLoaded: (imageData: ImageData) => void;
  disabled: boolean;
};

export function PresetPicker({ value, onChange, onImageLoaded, disabled }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Sample</h2>
      <div role="radiogroup" aria-label="Sample" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRESET_KINDS.map((kind) => (
          <Button
            key={kind}
            role="radio"
            aria-checked={kind === value}
            variant={kind === value ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => onChange(kind)}
          >
            {PRESETS[kind].label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{PRESETS[value].blurb}</p>
      {value === 'image' && <PhotoUpload onImageLoaded={onImageLoaded} disabled={disabled} />}
    </section>
  );
}
