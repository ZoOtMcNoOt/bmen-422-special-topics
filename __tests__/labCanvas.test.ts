import { describe, expect, it, vi } from 'vitest';
import {
  colorizeLabCamera, drawCameraPreview, drawLocalizationCloud, labViewport,
} from '@/lib/rendering/labCanvas';

/** Minimal canvas recorder: geometry and buffers can be tested without a browser. */
function canvasHarness(cssWidth = 400, cssHeight = 200, dpr = 1) {
  const created: ReturnType<typeof makeCanvas>[] = [];
  const documentMock: { defaultView: { devicePixelRatio: number }; createElement: () => HTMLCanvasElement } = {
    defaultView: { devicePixelRatio: dpr },
    createElement: () => {
      const child = makeCanvas(0, 0);
      created.push(child);
      return child.canvas;
    },
  };
  function makeCanvas(width: number, height: number) {
    const gradient = { addColorStop: vi.fn() };
    const context = {
      setTransform: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
      beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      drawImage: vi.fn(), createRadialGradient: vi.fn(() => gradient), putImageData: vi.fn(),
      createImageData: vi.fn((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
      fillStyle: '', strokeStyle: '', imageSmoothingEnabled: true,
    };
    const style = { setProperty: vi.fn() };
    const canvas = {
      width: 300, height: 150,
      getBoundingClientRect: () => ({ width, height }),
      getContext: () => context,
      ownerDocument: documentMock,
      parentElement: { style },
    } as unknown as HTMLCanvasElement;
    return { canvas, context, gradient, style };
  }
  return { ...makeCanvas(cssWidth, cssHeight), created };
}

describe('original lab display geometry and palette', () => {
  it('caps DPR while letterboxing a square physical field in a wide container', () => {
    expect(labViewport(480, 300, 3)).toEqual({
      width: 480, height: 300, dpr: 2, pixelWidth: 960, pixelHeight: 600,
      side: 300, left: 90, top: 0,
    });
    expect(labViewport(200, 400)).toMatchObject({ side: 200, left: 0, top: 100 });
  });

  it('preserves the exact original purple LUT at representative intensities', () => {
    expect(Array.from(colorizeLabCamera(new Uint8Array([0, 64, 128, 192, 255])))).toEqual([
      11, 16, 32, 255, 64, 46, 95, 255, 114, 84, 146, 255,
      184, 165, 193, 255, 249, 241, 238, 255,
    ]);
  });

  it('returns independent color buffers', () => {
    const first = colorizeLabCamera(new Uint8Array([255]));
    first.fill(0);
    expect(Array.from(colorizeLabCamera(new Uint8Array([255])))).toEqual([249, 241, 238, 255]);
  });

  it('maps nm view offsets without adding a camera half-pixel shift', () => {
    const target = canvasHarness(400, 200, 3);
    drawLocalizationCloud(target.canvas, [{ x: 4200, y: 5200 }], { x0: 1000, y0: 2000, sizeNm: 6400 });
    expect(target.canvas.width).toBe(800);
    expect(target.canvas.height).toBe(400);
    expect(target.context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(target.style.setProperty).toHaveBeenCalledWith('--field-side', '200px');
    expect(target.context.rect).toHaveBeenCalledWith(100, 0, 200, 200);
    expect(target.context.drawImage).toHaveBeenCalledWith(target.created[0].canvas, 198.5, 98.5, 3, 3);
    expect(target.context.moveTo).toHaveBeenCalledWith(118.75, 0);
    expect(target.context.moveTo).toHaveBeenCalledWith(100, 37.5);
    expect(target.created[0].gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(79,222,193,0.9)');
  });

  it('uses the original amber sprite for ground truth', () => {
    const target = canvasHarness();
    drawLocalizationCloud(target.canvas, [{ x: 100, y: 100 }], { x0: 0, y0: 0, sizeNm: 200 }, { truth: true });
    expect(target.created[0].gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(239,190,113,0.9)');
    expect(target.created[0].gradient.addColorStop).toHaveBeenCalledWith(0.52, 'rgba(239,190,113,0.09)');
  });

  it('uses explicit PNG dimensions independently of layout and screen DPR', () => {
    const target = canvasHarness(0, 0, 3);
    drawLocalizationCloud(target.canvas, [], { x0: 0, y0: 0, sizeNm: 6400 }, { width: 1024, height: 768 });
    expect(target.canvas.width).toBe(1024);
    expect(target.canvas.height).toBe(768);
    expect(target.context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(target.context.rect).toHaveBeenCalledWith(128, 0, 768, 768);
  });

  it('supports a detached canvas sized through its backing dimensions', () => {
    const target = canvasHarness(0, 0, 3);
    target.canvas.width = target.canvas.height = 1024;
    drawLocalizationCloud(target.canvas, [], { x0: 0, y0: 0, sizeNm: 6400 });
    expect(target.canvas.width).toBe(1024);
    expect(target.canvas.height).toBe(1024);
    expect(target.context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('letterboxes rectangular camera frames and scales the bar to their drawn width', () => {
    const target = canvasHarness(400, 200);
    drawCameraPreview(target.canvas, new Uint8Array(32 * 64), 32, 64);
    expect(target.context.drawImage).toHaveBeenCalledWith(target.created[0].canvas, 150, 0, 100, 200);
    expect(target.style.setProperty).toHaveBeenLastCalledWith('--field-side', '100px');
    expect(target.context.imageSmoothingEnabled).toBe(false);
  });

  it('crops the sensor to the same nm view with fractional camera-pixel offsets', () => {
    const target = canvasHarness(400, 200, 2);
    drawCameraPreview(target.canvas, new Uint8Array(64 * 64), 64, 64, {
      view: { x0: 4845, y0: 4685, sizeNm: 500 }, pixelSizeNm: 160,
    });
    expect(target.context.drawImage).toHaveBeenCalledWith(
      target.created[0].canvas, 30.28125, 29.28125, 3.125, 3.125, 100, 0, 200, 200,
    );
    expect(target.style.setProperty).toHaveBeenLastCalledWith('--field-side', '200px');
    expect(target.context.imageSmoothingEnabled).toBe(false);
  });

  it('smoothly scales an optical preview, then restores unsmoothed camera sampling', () => {
    const target = canvasHarness(400, 200);
    const pixels = new Uint8Array(48 * 48);
    drawCameraPreview(target.canvas, pixels, 48, 48, { smooth: true });
    expect(target.context.imageSmoothingEnabled).toBe(true);
    expect(target.context.drawImage).toHaveBeenLastCalledWith(target.created[0].canvas, 100, 0, 200, 200);
    drawCameraPreview(target.canvas, pixels, 48, 48);
    expect(target.context.imageSmoothingEnabled).toBe(false);
  });

  it('keeps off-sensor portions blank without stretching the visible crop', () => {
    const target = canvasHarness(400, 200);
    drawCameraPreview(target.canvas, new Uint8Array(64 * 64), 64, 64, {
      view: { x0: -160, y0: 0, sizeNm: 640 }, pixelSizeNm: 160,
    });
    expect(target.context.drawImage).toHaveBeenCalledWith(
      target.created[0].canvas, 0, 0, 3, 4, 150, 0, 150, 200,
    );
  });

  it('requires physical crop size and pixel pitch together', () => {
    const target = canvasHarness();
    expect(() => drawCameraPreview(target.canvas, null, 64, 64, { pixelSizeNm: 160 })).toThrow(/both/);
    expect(() => drawCameraPreview(target.canvas, null, 64, 64, {
      view: { x0: 0, y0: 0, sizeNm: 1000 },
    })).toThrow(/both/);
  });

  it('isolates preview buffers across panels and clears a missing frame to navy', () => {
    const first = canvasHarness();
    const second = canvasHarness();
    drawCameraPreview(first.canvas, new Uint8Array([255]), 1, 1);
    drawCameraPreview(second.canvas, new Uint8Array([0]), 1, 1);
    expect(first.created[0].canvas).not.toBe(second.created[0].canvas);
    expect(Array.from(first.created[0].context.putImageData.mock.calls[0][0].data)).toEqual([249, 241, 238, 255]);
    expect(Array.from(second.created[0].context.putImageData.mock.calls[0][0].data)).toEqual([11, 16, 32, 255]);
    const calls = first.context.drawImage.mock.calls.length;
    drawCameraPreview(first.canvas, null);
    expect(first.context.fillStyle).toBe('#0b1020');
    expect(first.context.fillRect).toHaveBeenLastCalledWith(0, 0, 400, 200);
    expect(first.context.drawImage).toHaveBeenCalledTimes(calls);
  });

  it('rejects incompatible camera dimensions instead of drawing incomplete pixels', () => {
    const target = canvasHarness();
    expect(() => drawCameraPreview(target.canvas, new Uint8Array(2), 2, 2)).toThrow(/pixel count/);
  });
});
