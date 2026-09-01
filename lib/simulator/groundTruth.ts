import type { Emitter, GroundTruth, GroundTruthInput } from './types';

type Field = { width: number; height: number };

/** Rejection sampling gives up after this many draws per requested emitter. */
const MAX_REJECTION_ATTEMPTS_PER_EMITTER = 1000;

export function generateGroundTruth(input: GroundTruthInput, field: Field): GroundTruth {
  switch (input.kind) {
    case 'two-lines': return twoLines(input, field);
    case 'ring': return ring(input, field);
    case 'actin': return actin(input, field);
    case 'image': return fromImage(input, field);
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

function fromImage(
  { imageData, nEmitters }: Extract<GroundTruthInput, { kind: 'image' }>,
  field: Field
): GroundTruth {
  const { width, height, data } = imageData;

  // Luminance normalised to peak 1 becomes the sampling probability.
  const intensity = new Float32Array(width * height);
  let peak = 0;
  for (let i = 0; i < intensity.length; i++) {
    const lum = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    intensity[i] = lum;
    if (lum > peak) peak = lum;
  }
  if (peak === 0) throw new Error('Image has no bright pixels to sample from');
  for (let i = 0; i < intensity.length; i++) intensity[i] /= peak;

  // Letterbox the image into the field, preserving aspect ratio.
  const scale = Math.min(field.width / width, field.height / height);
  const offsetX = (field.width - width * scale) / 2;
  const offsetY = (field.height - height * scale) / 2;

  const emitters: Emitter[] = [];
  const maxAttempts = nEmitters * MAX_REJECTION_ATTEMPTS_PER_EMITTER;
  for (let attempts = 0; emitters.length < nEmitters && attempts < maxAttempts; attempts++) {
    const px = Math.floor(Math.random() * width);
    const py = Math.floor(Math.random() * height);
    if (Math.random() < intensity[py * width + px]) {
      emitters.push({
        x: offsetX + (px + Math.random()) * scale,
        y: offsetY + (py + Math.random()) * scale,
      });
    }
  }
  return { emitters, fieldSizeNm: field, label: `Uploaded image, ${emitters.length} emitters` };
}
