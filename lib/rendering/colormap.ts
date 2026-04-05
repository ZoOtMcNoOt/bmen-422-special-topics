/**
 * Colormap functions map a normalized value in [0, 1] to an RGB triplet in [0, 255].
 */
export type Colormap = (v: number) => [number, number, number];

export const grayscale: Colormap = (v) => {
  const g = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return [g, g, g];
};

export const hot: Colormap = (v) => {
  const x = Math.max(0, Math.min(1, v));
  const r = Math.round(Math.min(1, x * 3) * 255);
  const g = Math.round(Math.min(1, Math.max(0, x * 3 - 1)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, x * 3 - 2)) * 255);
  return [r, g, b];
};

export const fire: Colormap = (v) => {
  // Black → red → orange → yellow → white
  const x = Math.max(0, Math.min(1, v));
  const r = Math.round(Math.min(1, x * 1.5) * 255);
  const g = Math.round(Math.min(1, Math.max(0, x - 0.3) * 1.5) * 255);
  const b = Math.round(Math.min(1, Math.max(0, x - 0.75) * 4) * 255);
  return [r, g, b];
};
