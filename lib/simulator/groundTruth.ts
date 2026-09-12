import type { Emitter, GroundTruth, GroundTruthInput } from './types';

type Field = { width: number; height: number };

export function generateGroundTruth(
  input: GroundTruthInput,
  field: Field,
  rng: () => number = Math.random,
): GroundTruth {
  switch (input.kind) {
    case 'two-lines': return twoLines(input, field);
    case 'ring': return ring(input, field);
    case 'actin': return actin(input, field);
    case 'image': return fromImage(input, field, rng);
  }
}

function twoLines(
  { separationNm, lengthNm, nPerLine }: Extract<GroundTruthInput, { kind: 'two-lines' }>,
  field: Field
): GroundTruth {
  const cx = field.width / 2;
  const cy = field.height / 2;
  const emitters: Emitter[] = [];
  for (let i = 0; i < nPerLine; i++) {
    const t = nPerLine === 1 ? 0.5 : i / (nPerLine - 1);
    const x = cx - lengthNm / 2 + t * lengthNm;
    emitters.push({ x, y: cy - separationNm / 2 }, { x, y: cy + separationNm / 2 });
  }
  return { emitters, fieldSizeNm: field, label: `Two lines, ${separationNm} nm apart` };
}

function ring(
  { diameterNm, nEmitters }: Extract<GroundTruthInput, { kind: 'ring' }>,
  field: Field
): GroundTruth {
  const cx = field.width / 2;
  const cy = field.height / 2;
  const r = diameterNm / 2;
  const emitters: Emitter[] = Array.from({ length: nEmitters }, (_, i) => {
    const theta = (2 * Math.PI * i) / nEmitters;
    return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
  });
  return { emitters, fieldSizeNm: field, label: `Ring, ${diameterNm} nm diameter` };
}

function actin(
  { periodNm, rungLengthNm, nRungs, nPerRung }: Extract<GroundTruthInput, { kind: 'actin' }>,
  field: Field
): GroundTruth {
  const cx = field.width / 2;
  const cy = field.height / 2;
  const halfSpan = ((nRungs - 1) * periodNm) / 2;
  const emitters: Emitter[] = [];
  for (let r = 0; r < nRungs; r++) {
    const x = cx - halfSpan + r * periodNm;
    for (let i = 0; i < nPerRung; i++) {
      const t = nPerRung === 1 ? 0.5 : i / (nPerRung - 1);
      emitters.push({ x, y: cy - rungLengthNm / 2 + t * rungLengthNm });
    }
  }
  return { emitters, fieldSizeNm: field, label: `Actin rings, ${periodNm} nm period` };
}

function visibleIntensity(data: Uint8ClampedArray, index: number): number {
  const i = index * 4;
  return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * data[i + 3] / 255;
}

/** Transparent RGB values contribute no signal to the uploaded specimen. */
export function imageHasSignal(image: ImageData): boolean {
  for (let i = 0; i < image.width * image.height; i++) {
    if (visibleIntensity(image.data, i) > 0) return true;
  }
  return false;
}

/** Letterbox an image into the specimen field; all returned coordinates are nm. */
export function imageBounds(sourceSize: Field, field: Field): { x0: number; y0: number; width: number; height: number } {
  if (![sourceSize.width, sourceSize.height, field.width, field.height].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error('Image and specimen field dimensions must be positive and finite');
  }
  const scale = Math.min(field.width / sourceSize.width, field.height / sourceSize.height);
  const width = sourceSize.width * scale;
  const height = sourceSize.height * scale;
  return { x0: (field.width - width) / 2, y0: (field.height - height) / 2, width, height };
}

function fromImage(
  { imageData, nEmitters, sourceSize }: Extract<GroundTruthInput, { kind: 'image' }>,
  field: Field,
  rng: () => number,
): GroundTruth {
  const { width, height, data } = imageData;
  const source = sourceSize ?? { width, height };
  if (!Number.isSafeInteger(nEmitters) || nEmitters < 0) {
    throw new Error('The requested emitter count must be a non-negative integer');
  }
  if (![width, height, source.width, source.height].every((v) => Number.isSafeInteger(v) && v > 0)
    || data.length !== width * height * 4) {
    throw new Error('Image dimensions do not match its pixels');
  }
  // Retain physical aspect ratio even when the sampling buffer has a one-pixel side.
  const bounds = imageBounds(source, field);

  // A cumulative distribution samples exactly nEmitters, including specimens
  // consisting of a single visible pixel. Zero-weight pixels are never chosen.
  const cumulative = new Float64Array(width * height);
  let total = 0;
  let lastVisiblePixel = -1;
  for (let i = 0; i < cumulative.length; i++) {
    const weight = visibleIntensity(data, i);
    total += weight;
    cumulative[i] = total;
    if (weight > 0) lastVisiblePixel = i;
  }
  if (total === 0) throw new Error('Image has no bright pixels with non-zero opacity to sample from');

  const draw = () => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error('The random generator must return values in [0, 1)');
    }
    return value;
  };

  const emitters: Emitter[] = [];
  for (let i = 0; i < nEmitters; i++) {
    const target = draw() * total;
    let low = 0;
    let high = lastVisiblePixel;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (cumulative[mid] <= target) low = mid + 1;
      else high = mid;
    }
    const px = low % width;
    const py = Math.floor(low / width);
    emitters.push({
      x: bounds.x0 + ((px + draw()) / width) * bounds.width,
      y: bounds.y0 + ((py + draw()) / height) * bounds.height,
    });
  }
  return { emitters, fieldSizeNm: field, label: `Uploaded image, ${nEmitters} emitters` };
}
