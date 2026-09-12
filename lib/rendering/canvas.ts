/** Uploaded images are downsampled so their longer side is at most this many pixels. */
const MAX_UPLOAD_PX = 512;

/** Sampling pixels plus the source dimensions used for physical placement. */
export type DecodedImage = { pixels: ImageData; width: number; height: number };

/** Decode sampling pixels with a bounded longer side and retain original dimensions. */
export async function fileToImageData(file: File, maxSize = MAX_UPLOAD_PX): Promise<DecodedImage> {
  if (!Number.isSafeInteger(maxSize) || maxSize < 1) {
    throw new Error('The maximum image size must be a positive integer');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    if (img.naturalWidth < 1 || img.naturalHeight < 1) throw new Error('The image has no pixels');
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    ctx.drawImage(img, 0, 0, w, h);
    return {
      pixels: ctx.getImageData(0, 0, w, h),
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
