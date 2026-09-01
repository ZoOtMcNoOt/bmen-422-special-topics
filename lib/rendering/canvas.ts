import type { Colormap } from './colormap';

/** Draw a square Float32 buffer to a canvas, contrast-stretched to [min, max]. */
export function drawPixelBufferToCanvas(
  canvas: HTMLCanvasElement,
  pixels: Float32Array,
  size: number,
  colormap: Colormap
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = size;
  canvas.height = size;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] < min) min = pixels[i];
    if (pixels[i] > max) max = pixels[i];
  }
  const range = max - min || 1;

  const img = ctx.createImageData(size, size);
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b] = colormap((pixels[i] - min) / range);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

/** Uploaded images are downsampled so their longer side is at most this many pixels. */
const MAX_UPLOAD_PX = 512;

/** Decode an image file to ImageData, downsampling so the longer side ≤ maxSize. */
export async function fileToImageData(file: File, maxSize = MAX_UPLOAD_PX): Promise<ImageData> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

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
