import type { Colormap } from './colormap';

/**
 * Draw a Float32Array pixel buffer to a canvas, auto-scaling to [min, max] and
 * applying a colormap.
 */
export function drawPixelBufferToCanvas(
  canvas: HTMLCanvasElement,
  pixels: Float32Array,
  width: number,
  height: number,
  colormap: Colormap,
  scale?: { min: number; max: number }
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = width;
  canvas.height = height;

  let min = Infinity;
  let max = -Infinity;
  if (scale) {
    min = scale.min;
    max = scale.max;
  } else {
    for (let i = 0; i < pixels.length; i++) {
      const v = pixels[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const range = max - min || 1;

  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < pixels.length; i++) {
    const normalized = (pixels[i] - min) / range;
    const [r, g, b] = colormap(normalized);
    imageData.data[i * 4] = r;
    imageData.data[i * 4 + 1] = g;
    imageData.data[i * 4 + 2] = b;
    imageData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Read an image file as an HTMLImageElement, then extract its ImageData.
 */
export async function fileToImageData(file: File, maxSize: number = 512): Promise<ImageData> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });

    // Downsample if larger than maxSize
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (w > maxSize || h > maxSize) {
      const scale = maxSize / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}
