import { clamp } from '@/lib/utils';

/** Maps a value in [0, 1] to an RGB triplet in [0, 255]. */
export type Colormap = (v: number) => [number, number, number];

/** Black → red → yellow → white. The one colormap every panel uses. */
export const hot: Colormap = (v) => {
  const x = clamp(v, 0, 1);
  return [
    Math.round(clamp(x * 3, 0, 1) * 255),
    Math.round(clamp(x * 3 - 1, 0, 1) * 255),
    Math.round(clamp(x * 3 - 2, 0, 1) * 255),
  ];
};
