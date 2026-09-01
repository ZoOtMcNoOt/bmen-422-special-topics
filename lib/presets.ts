import { DIFFRACTION_LIMIT_NM, FIELD_SIZE_NM } from './simulator/defaults';
import { clamp } from './utils';
import type { Emitter, GroundTruthInput, ViewBox } from './simulator/types';

export type PresetKind = 'two-lines' | 'ring' | 'actin' | 'image';

export const PRESET_KINDS: readonly PresetKind[] = ['two-lines', 'ring', 'actin', 'image'];
export const isPresetKind = (v: unknown): v is PresetKind => PRESET_KINDS.some((k) => k === v);

export const DEFAULT_PRESET: PresetKind = 'two-lines';
export const DEFAULT_DENSITY_PER_UM2 = 250;
/** Emitter count is capped so the acquisition stays interactive. */
export const MAX_EMITTERS = 10_000;

type Preset = {
  label: string;
  /** One clause, shown under the picker. */
  blurb: string;
  /** Side of the square region the panels show. `null` = whole field. */
  viewSizeNm: number | null;
  build: (nEmitters: number, image: ImageData | null) => GroundTruthInput | null;
};

export const PRESETS: Record<PresetKind, Preset> = {
  'two-lines': {
    label: 'Two lines',
    blurb: `50 nm apart — well below the ~${DIFFRACTION_LIMIT_NM} nm diffraction limit.`,
    viewSizeNm: 1000,
    build: (n) => ({
      kind: 'two-lines',
      separationNm: 50,
      lengthNm: 3000,
      nPerLine: Math.max(2, Math.floor(n / 2)),
    }),
  },
  ring: {
    label: 'Microtubule',
    blurb: '60 nm ring — an antibody-labelled microtubule seen end-on.',
    viewSizeNm: 500,
    build: (n) => ({ kind: 'ring', diameterNm: 60, nEmitters: n }),
  },
  actin: {
    label: 'Actin rings',
    blurb: '190 nm periodic actin–spectrin lattice (Xu et al., Science 2013).',
    viewSizeNm: 2000,
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
    blurb: 'Upload a picture — bright pixels become molecules.',
    viewSizeNm: null,
    build: (n, image) => (image ? { kind: 'image', imageData: image, nEmitters: n } : null),
  },
};

export function emitterCount(densityPerUm2: number): number {
  const areaUm2 = (FIELD_SIZE_NM / 1000) ** 2;
  return Math.min(MAX_EMITTERS, Math.round(densityPerUm2 * areaUm2));
}

/** Auto-fit views never zoom in past this, so a tiny sketch isn't blown up beyond the PSF. */
const MIN_VIEW_NM = 500;
const FIT_PADDING = 0.1;

/**
 * The square view box for a preset. Built-in samples use a tuned size centred
 * on the field; the image preset fits the box to wherever the molecules are.
 */
export function viewBoxFor(kind: PresetKind, emitters?: readonly Emitter[]): ViewBox {
  const fixed = PRESETS[kind].viewSizeNm;
  if (fixed !== null || !emitters?.length) return centred(fixed ?? FIELD_SIZE_NM);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const e of emitters) {
    if (e.x < minX) minX = e.x;
    if (e.x > maxX) maxX = e.x;
    if (e.y < minY) minY = e.y;
    if (e.y > maxY) maxY = e.y;
  }
  const sizeNm = clamp(Math.max(maxX - minX, maxY - minY) * (1 + 2 * FIT_PADDING), MIN_VIEW_NM, FIELD_SIZE_NM);
  return {
    x0: clamp((minX + maxX) / 2 - sizeNm / 2, 0, FIELD_SIZE_NM - sizeNm),
    y0: clamp((minY + maxY) / 2 - sizeNm / 2, 0, FIELD_SIZE_NM - sizeNm),
    sizeNm,
  };
}

function centred(sizeNm: number): ViewBox {
  const offset = (FIELD_SIZE_NM - sizeNm) / 2;
  return { x0: offset, y0: offset, sizeNm };
}
