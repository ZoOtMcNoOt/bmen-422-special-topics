// Node has no ImageData. The image sampler only reads { data, width, height },
// so a plain duck-typed class is enough.
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;

    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      this.data = data;
      this.width = width;
      this.height = height ?? data.length / 4 / width;
    }
  }
  (globalThis as { ImageData: unknown }).ImageData = ImageDataPolyfill;
}
