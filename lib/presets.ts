import { FIELD_SIZE_NM } from './simulator/defaults';
import type { GroundTruthInput, ViewBox } from './simulator/types';
import type { DecodedImage } from './rendering/canvas';

export type PresetKind = 'two-lines' | 'ring' | 'actin' | 'image';

export const PRESET_KINDS: readonly PresetKind[] = ['two-lines', 'ring', 'actin', 'image'];
export const isPresetKind = (v: unknown): v is PresetKind => PRESET_KINDS.some((k) => k === v);

export const DEFAULT_PRESET: PresetKind = 'two-lines';
/** The control specifies the actual label count, not the empty camera's area. */
export const MIN_EMITTERS = 20;
export const MAX_EMITTERS = 10_000;
export const EMITTER_STEP = 10;

type Preset = {
  label: string;
  /** One clause, shown under the picker. */
  blurb: string;
  /** Side of the square region the panels show. `null` = whole field. */
  viewSizeNm: number | null;
  defaultEmitters: number;
  build: (nEmitters: number, image: DecodedImage | null) => GroundTruthInput | null;
};

export const PRESETS: Record<PresetKind, Preset> = {
  'two-lines': {
    label: 'Two lines',
    blurb: 'Two 3 µm lines separated by 50 nm.',
    viewSizeNm: 3600,
    defaultEmitters: 600,
    build: (n) => ({
      kind: 'two-lines',
      separationNm: 50,
      lengthNm: 3000,
      nPerLine: Math.max(2, Math.floor(n / 2)),
    }),
  },
  ring: {
    label: 'Ring',
    blurb: 'A 60 nm diameter ring, viewed from above.',
    viewSizeNm: 250,
    defaultEmitters: 120,
    build: (n) => ({ kind: 'ring', diameterNm: 60, nEmitters: n }),
  },
  actin: {
    label: 'Actin, side view',
    blurb: 'Ten rungs, 190 nm apart. A simplified side view of actin rings.',
    viewSizeNm: 2400,
    defaultEmitters: 500,
    build: (n) => ({
      kind: 'actin',
      periodNm: 190,
      rungLengthNm: 400,
      nRungs: 10,
      nPerRung: Math.max(1, Math.floor(n / 10)),
    }),
  },
  image: {
    label: 'Your image',
    blurb: 'Bright image pixels define the sample.',
    viewSizeNm: null,
    defaultEmitters: 2000,
    build: (n, image) => (image ? {
      kind: 'image', imageData: image.pixels,
      sourceSize: { width: image.width, height: image.height }, nEmitters: n,
    } : null),
  },
};

/**
 * The whole specimen, including the full uploaded image. The physical field
 * must not change with random labelling or hide unlabelled parts of the source.
 */
export function viewBoxFor(kind: PresetKind): ViewBox {
  return centred(PRESETS[kind].viewSizeNm ?? FIELD_SIZE_NM);
}

function centred(sizeNm: number): ViewBox {
  const offset = (FIELD_SIZE_NM - sizeNm) / 2;
  return { x0: offset, y0: offset, sizeNm };
}
