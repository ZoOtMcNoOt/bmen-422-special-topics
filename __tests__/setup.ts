// Minimal ImageData polyfill for jsdom.
// jsdom does not ship an ImageData class unless the optional `canvas`
// native package is installed. Our physics tests only need a plain
// duck-typed value with { data, width, height } — not a real canvas.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ImageData = ImageDataPolyfill;
}
