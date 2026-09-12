'use client';

import { PRESETS, PRESET_KINDS, type PresetKind } from '@/lib/presets';
import { PhotoUpload } from './PhotoUpload';

type Props = {
  value: PresetKind;
  onChange: (kind: PresetKind) => void;
  onImageLoaded: (imageData: ImageData) => void;
  disabled: boolean;
};

export function PresetPicker({
  value,
  onChange,
  onImageLoaded,
  disabled,
}: Props) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Specimen</h2>
      <div role="radiogroup" aria-label="Sample" className="sample-grid">
        {PRESET_KINDS.map((kind) => (
          <label key={kind} className="sample-choice">
            <input
              type="radio"
              name="sample"
              value={kind}
              checked={kind === value}
              disabled={disabled}
              onChange={() => onChange(kind)}
              className="sr-only"
            />
            <SampleIcon kind={kind} />
            {
              {
                'two-lines': 'Lines',
                ring: 'Ring',
                actin: 'Actin',
                image: 'Image',
              }[kind]
            }
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{PRESETS[value].blurb}</p>
      {value === 'image' && (
        <PhotoUpload onImageLoaded={onImageLoaded} disabled={disabled} />
      )}
    </section>
  );
}

function SampleIcon({ kind }: { kind: PresetKind }) {
  return (
    <svg
      viewBox="0 0 50 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {kind === 'two-lines' && (
        <>
          <path d="M6 12h38M6 20h38" />
          <path d="M9 9h32M9 23h32" opacity=".15" strokeWidth="4" />
        </>
      )}
      {kind === 'ring' && (
        <>
          <circle cx="25" cy="16" r="10" strokeWidth="4" opacity=".22" />
          <circle cx="25" cy="16" r="10" strokeDasharray="1 3" />
        </>
      )}
      {kind === 'actin' && (
        <>
          <path
            d="M10 9h30M10 16h30M10 23h30"
            strokeDasharray="1 3"
            strokeWidth="3"
          />
          <path d="M14 5v23M36 5v23" opacity=".2" />
        </>
      )}
      {kind === 'image' && (
        <>
          <rect x="12" y="5" width="26" height="22" rx="3" />
          <path d="m14 24 8-8 5 5 4-4 5 6" />
          <circle cx="30" cy="11" r="1.5" />
        </>
      )}
    </svg>
  );
}
