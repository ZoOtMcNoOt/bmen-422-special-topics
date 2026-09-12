import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileToImageData } from '@/lib/rendering/canvas';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function browserImage(width: number, height: number, fails = false) {
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:specimen');
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) =>
      new ImageData(new Uint8ClampedArray(w * h * 4), w, h)),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  vi.stubGlobal('Image', class {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: ((error: Error) => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => {
        if (fails) this.onerror?.(new Error('Image decoding failed'));
        else this.onload?.();
      });
    }
  });
  return { canvas, context, createUrl, revokeUrl };
}

describe('uploaded image decoding boundary', () => {
  it.each([
    [400, 200, 400, 200],
    [2048, 1024, 512, 256],
    [10000, 1, 512, 1],
    [1, 10000, 1, 512],
  ])('retains %d×%d source dimensions in a nonempty %d×%d buffer', async (width, height, w, h) => {
    const browser = browserImage(width, height);
    const file = new File([], 'specimen.png', { type: 'image/png' });
    const decoded = await fileToImageData(file);
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(decoded.pixels.width).toBe(w);
    expect(decoded.pixels.height).toBe(h);
    expect(browser.canvas.width).toBe(w);
    expect(browser.canvas.height).toBe(h);
    expect(browser.context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, w, h);
    expect(browser.createUrl).toHaveBeenCalledWith(file);
    expect(browser.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:specimen');
  });

  it('releases the object URL if the browser cannot decode the file', async () => {
    const browser = browserImage(100, 100, true);
    await expect(fileToImageData(new File([], 'broken.png'))).rejects.toThrow(/decoding failed/);
    expect(browser.context.drawImage).not.toHaveBeenCalled();
    expect(browser.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:specimen');
  });

  it('rejects images with no decoded pixels and releases their object URL', async () => {
    const browser = browserImage(0, 100);
    await expect(fileToImageData(new File([], 'empty.png'))).rejects.toThrow(/no pixels/);
    expect(browser.revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:specimen');
  });

  it.each([0, -1, 1.5, Infinity])('rejects an invalid maximum size before allocating image resources: %s', async (maxSize) => {
    const browser = browserImage(100, 100);
    await expect(fileToImageData(new File([], 'specimen.png'), maxSize)).rejects.toThrow(/positive integer/);
    expect(browser.createUrl).not.toHaveBeenCalled();
  });
});
