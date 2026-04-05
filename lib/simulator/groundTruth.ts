import type { GroundTruth, GroundTruthInput, Emitter } from './types';

export function generateGroundTruth(
  input: GroundTruthInput,
  fieldSizeNm: { width: number; height: number }
): GroundTruth {
  switch (input.kind) {
    case 'two-lines':
      return generateTwoLines(input, fieldSizeNm);
    case 'microtubule-ring':
      return generateRing(input, fieldSizeNm);
    case 'actin-periodic':
      return generateActin(input, fieldSizeNm);
    case 'image':
      return generateFromImage(input, fieldSizeNm);
  }
}

function generateTwoLines(
  input: { kind: 'two-lines'; separationNm: number; length: number; nPerLine: number },
  fieldSizeNm: { width: number; height: number }
): GroundTruth {
  const cx = fieldSizeNm.width / 2;
  const cy = fieldSizeNm.height / 2;
  const halfLength = input.length / 2;
  const emitters: Emitter[] = [];
  for (let i = 0; i < input.nPerLine; i++) {
    const t = input.nPerLine === 1 ? 0.5 : i / (input.nPerLine - 1);
    const x = cx - halfLength + t * input.length;
    emitters.push({ x, y: cy - input.separationNm / 2 });
    emitters.push({ x, y: cy + input.separationNm / 2 });
  }
  return {
    emitters,
    fieldSizeNm,
    label: `Two lines, ${input.separationNm} nm separation`,
  };
}

function generateRing(
  input: { kind: 'microtubule-ring'; diameterNm: number; nEmitters: number },
  fieldSizeNm: { width: number; height: number }
): GroundTruth {
  const cx = fieldSizeNm.width / 2;
  const cy = fieldSizeNm.height / 2;
  const r = input.diameterNm / 2;
  const emitters: Emitter[] = [];
  for (let i = 0; i < input.nEmitters; i++) {
    const theta = (2 * Math.PI * i) / input.nEmitters;
    emitters.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
  }
  return {
    emitters,
    fieldSizeNm,
    label: `Microtubule ring, ${input.diameterNm} nm diameter`,
  };
}

function generateActin(
  input: {
    kind: 'actin-periodic';
    periodNm: number;
    lengthNm: number;
    nRungs: number;
    nPerRung: number;
  },
  fieldSizeNm: { width: number; height: number }
): GroundTruth {
  const cx = fieldSizeNm.width / 2;
  const cy = fieldSizeNm.height / 2;
  const halfSpan = ((input.nRungs - 1) * input.periodNm) / 2;
  const rungHalfLen = input.lengthNm / 2;
  const emitters: Emitter[] = [];
  for (let r = 0; r < input.nRungs; r++) {
    const x = cx - halfSpan + r * input.periodNm;
    for (let i = 0; i < input.nPerRung; i++) {
      const t = input.nPerRung === 1 ? 0.5 : i / (input.nPerRung - 1);
      const y = cy - rungHalfLen + t * input.lengthNm;
      emitters.push({ x, y });
    }
  }
  return {
    emitters,
    fieldSizeNm,
    label: `Actin periodic scaffold, ${input.periodNm} nm period`,
  };
}

function generateFromImage(
  input: { kind: 'image'; imageData: ImageData; nEmitters: number },
  fieldSizeNm: { width: number; height: number }
): GroundTruth {
  const { imageData, nEmitters } = input;
  const { width, height, data } = imageData;

  // Convert to grayscale intensity in [0, 1]
  const intensity = new Float32Array(width * height);
  let maxIntensity = 0;
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    intensity[i] = lum;
    if (lum > maxIntensity) maxIntensity = lum;
  }
  if (maxIntensity === 0) {
    throw new Error('Image contains no bright pixels to sample from');
  }
  // Normalize to peak = 1
  for (let i = 0; i < intensity.length; i++) intensity[i] /= maxIntensity;

  // Rejection sample emitters
  const emitters: Emitter[] = [];
  let attempts = 0;
  const maxAttempts = nEmitters * 1000;
  while (emitters.length < nEmitters && attempts < maxAttempts) {
    attempts++;
    const px = Math.floor(Math.random() * width);
    const py = Math.floor(Math.random() * height);
    const p = intensity[py * width + px];
    if (Math.random() < p) {
      // Map pixel (px, py) to field coordinates
      // Letterbox: fit image into field preserving aspect ratio
      const imgAspect = width / height;
      const fieldAspect = fieldSizeNm.width / fieldSizeNm.height;
      let scale: number;
      let offsetX = 0;
      let offsetY = 0;
      if (imgAspect > fieldAspect) {
        scale = fieldSizeNm.width / width;
        offsetY = (fieldSizeNm.height - height * scale) / 2;
      } else {
        scale = fieldSizeNm.height / height;
        offsetX = (fieldSizeNm.width - width * scale) / 2;
      }
      const x = offsetX + (px + Math.random()) * scale;
      const y = offsetY + (py + Math.random()) * scale;
      emitters.push({ x, y });
    }
  }

  return {
    emitters,
    fieldSizeNm,
    label: `Uploaded image (${nEmitters} emitters)`,
  };
}
