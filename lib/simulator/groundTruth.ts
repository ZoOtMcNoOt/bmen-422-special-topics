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
  _input: { kind: 'image'; imageData: ImageData; nEmitters: number },
  _fieldSizeNm: { width: number; height: number }
): GroundTruth {
  throw new Error('Image ground truth not yet implemented — see Task 9');
}
