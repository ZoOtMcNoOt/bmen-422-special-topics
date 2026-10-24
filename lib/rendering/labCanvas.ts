import type { GroundTruthInput, ViewBox } from '@/lib/simulator/types';
import { imageBounds } from '@/lib/simulator/groundTruth';

/** Rendering port of python/storm_slides/web/renderer.js; no simulation math. */
const FIELD = '#0b1020';
const GRID = '#151c2e';
const COLORS = { reconstruction: [79, 222, 193], truth: [239, 190, 113] } as const;

export type LabCanvasOptions = {
  /** Logical output dimensions. Supplying these defaults to DPR 1 for PNG export. */
  width?: number;
  height?: number;
  dpr?: number;
};

export type LabCameraOptions = LabCanvasOptions & {
  /** Provide both values to crop the sensor to the same physical field as the clouds. */
  view?: ViewBox;
  pixelSizeNm?: number;
  /** Interpolate an oversampled optical preview; acquired camera pixels stay sharp by default. */
  smooth?: boolean;
};

/** Exact backing-store size in device pixels, as reported by the browser. */
export type DevicePixelSize = { width: number; height: number };

export type LabViewport = {
  width: number;
  height: number;
  /** Device pixels per CSS pixel on each axis, derived from the whole-pixel backing size. */
  scaleX: number;
  scaleY: number;
  pixelWidth: number;
  pixelHeight: number;
  side: number;
  left: number;
  top: number;
};

/** Covers 3× phones and browser zoom while keeping backing stores bounded. */
const MAX_DPR = 4;

/**
 * Pure sizing geometry, shared by on-screen drawing and detached PNG canvases.
 * The drawing scale comes from the rounded backing size, so fractional CSS sizes
 * never stretch the image when the browser composites it.
 */
export function labViewport(
  width: number,
  height: number,
  dpr = 1,
  devicePixels?: DevicePixelSize,
): LabViewport {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('Canvas dimensions must be finite and positive');
  }
  if (!Number.isFinite(dpr) || dpr <= 0) throw new RangeError('Canvas DPR must be finite and positive');
  const ratio = Math.min(dpr, MAX_DPR);
  // A browser-reported size is only exact when the density was not capped.
  const exact = ratio === dpr && devicePixels && Number.isSafeInteger(devicePixels.width) &&
    Number.isSafeInteger(devicePixels.height) && devicePixels.width > 0 && devicePixels.height > 0
    ? devicePixels : undefined;
  const pixelWidth = exact?.width ?? Math.max(1, Math.round(width * ratio));
  const pixelHeight = exact?.height ?? Math.max(1, Math.round(height * ratio));
  const side = Math.min(width, height);
  return {
    width, height,
    scaleX: pixelWidth / width, scaleY: pixelHeight / height,
    pixelWidth, pixelHeight,
    side, left: (width - side) / 2, top: (height - side) / 2,
  };
}

const devicePixelSizes = new WeakMap<Element, DevicePixelSize>();

/**
 * Redraw canvases whenever their CSS size or the screen's pixel density changes.
 * Where the browser reports device-pixel content boxes, their exact sizes are kept
 * so each backing pixel maps to one screen pixel. Returns a cleanup function.
 */
export function observeCanvasResolution(
  canvases: readonly (HTMLCanvasElement | null)[],
  draw: () => void,
): () => void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.devicePixelContentBoxSize?.[0];
      if (box) devicePixelSizes.set(entry.target, { width: box.inlineSize, height: box.blockSize });
    }
    draw();
  });
  for (const canvas of canvases) {
    if (!canvas) continue;
    try {
      observer.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
      // Safari has no device-pixel boxes; CSS sizes and the DPR still apply.
      observer.observe(canvas);
    }
  }
  // Moving a window between screens changes the DPR without resizing the CSS box.
  let density: MediaQueryList | undefined;
  const onDensityChange = () => {
    watchDensity();
    draw();
  };
  const watchDensity = () => {
    density?.removeEventListener('change', onDensityChange);
    density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    density.addEventListener('change', onDensityChange);
  };
  watchDensity();
  return () => {
    observer.disconnect();
    density?.removeEventListener('change', onDensityChange);
  };
}

/** Original purple camera palette, including its gamma and bright-pixel highlight. */
export function colorizeLabCamera(pixels: Uint8Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const intensity = (pixels[i] / 255) ** 0.86;
    const highlight = Math.max(0, (intensity - 0.5) * 2);
    rgba[i * 4] = 11 + 174 * intensity + 64 * highlight;
    rgba[i * 4 + 1] = 16 + 100 * intensity + 125 * highlight;
    rgba[i * 4 + 2] = 32 + 206 * intensity;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

type CameraBuffer = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData;
};

type CanvasResources = {
  sprites: Partial<Record<keyof typeof COLORS, HTMLCanvasElement>>;
  camera?: CameraBuffer;
  source?: { canvas: HTMLCanvasElement; pixels: ImageData };
};

// Each target owns its resources. Drawing a second panel or PNG never mutates
// another panel's camera buffer; detached canvases can be garbage-collected.
const resources = new WeakMap<HTMLCanvasElement, CanvasResources>();

function canvasResources(canvas: HTMLCanvasElement): CanvasResources {
  let value = resources.get(canvas);
  if (!value) {
    value = { sprites: {} };
    resources.set(canvas, value);
  }
  return value;
}

/** Known specimen geometry or uploaded source; never used to locate camera spots. */
export function drawActualObject(
  canvas: HTMLCanvasElement,
  specimen: GroundTruthInput | null,
  field: { width: number; height: number },
  view: ViewBox,
  options: LabCanvasOptions = {},
): void {
  validateView(view);
  const viewport = prepare(canvas, options);
  if (!viewport || !specimen) return;
  const { ctx, side, left, top } = viewport;
  const scale = side / view.sizeNm;
  const x = (nm: number) => left + (nm - view.x0) * scale;
  const y = (nm: number) => top + (nm - view.y0) * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, side, side);
  ctx.clip();
  if (specimen.kind === 'image') {
    const cached = canvasResources(canvas);
    if (cached.source?.pixels !== specimen.imageData) {
      const source = canvas.ownerDocument.createElement('canvas');
      source.width = specimen.imageData.width;
      source.height = specimen.imageData.height;
      const context = source.getContext('2d');
      if (!context) { ctx.restore(); return; }
      context.putImageData(specimen.imageData, 0, 0);
      cached.source = { canvas: source, pixels: specimen.imageData };
    }
    const bounds = imageBounds(specimen.sourceSize ?? specimen.imageData, field);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cached.source.canvas, x(bounds.x0), y(bounds.y0), bounds.width * scale, bounds.height * scale);
  } else {
    const cx = field.width / 2;
    const cy = field.height / 2;
    ctx.strokeStyle = '#efbe71';
    // Object paths are geometrically thin; stroke width only makes them visible.
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#efbe7170';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    if (specimen.kind === 'ring') {
      ctx.arc(x(cx), y(cy), specimen.diameterNm * scale / 2, 0, 2 * Math.PI);
    } else if (specimen.kind === 'two-lines') {
      for (const sign of [-1, 1]) {
        const lineY = cy + sign * specimen.separationNm / 2;
        ctx.moveTo(x(cx - specimen.lengthNm / 2), y(lineY));
        ctx.lineTo(x(cx + specimen.lengthNm / 2), y(lineY));
      }
    } else {
      for (let rung = 0; rung < specimen.nRungs; rung++) {
        const rungX = cx + (rung - (specimen.nRungs - 1) / 2) * specimen.periodNm;
        ctx.moveTo(x(rungX), y(cy - specimen.rungLengthNm / 2));
        ctx.lineTo(x(rungX), y(cy + specimen.rungLengthNm / 2));
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function prepare(canvas: HTMLCanvasElement, options: LabCanvasOptions) {
  const bounds = canvas.getBoundingClientRect();
  const explicitSize = options.width !== undefined || options.height !== undefined;
  const hasLayout = bounds.width > 0 && bounds.height > 0;
  const onScreen = !explicitSize && hasLayout;
  const dpr = options.dpr ?? (onScreen ? canvas.ownerDocument.defaultView?.devicePixelRatio || 1 : 1);
  // Trust the observed device-pixel size only while it agrees with the current
  // layout; after a resize the observer reports the new size and redraws.
  const reported = onScreen ? devicePixelSizes.get(canvas) : undefined;
  const devicePixels = reported && Math.abs(reported.width - bounds.width * dpr) <= 1 &&
    Math.abs(reported.height - bounds.height * dpr) <= 1 ? reported : undefined;
  const viewport = labViewport(
    options.width ?? (hasLayout ? bounds.width : canvas.width),
    options.height ?? (hasLayout ? bounds.height : canvas.height),
    dpr,
    devicePixels,
  );
  if (canvas.width !== viewport.pixelWidth) canvas.width = viewport.pixelWidth;
  if (canvas.height !== viewport.pixelHeight) canvas.height = viewport.pixelHeight;
  canvas.parentElement?.style.setProperty('--field-side', `${viewport.side}px`);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(viewport.scaleX, 0, 0, viewport.scaleY, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = FIELD;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  return { ctx, ...viewport };
}

function glowSprite(canvas: HTMLCanvasElement, kind: keyof typeof COLORS): HTMLCanvasElement | null {
  const cached = canvasResources(canvas);
  const existing = cached.sprites[kind];
  if (existing) return existing;
  const sprite = canvas.ownerDocument.createElement('canvas');
  sprite.width = sprite.height = 32;
  const ctx = sprite.getContext('2d');
  if (!ctx) return null;
  const color = COLORS[kind].join(',');
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, `rgba(${color},0.9)`);
  gradient.addColorStop(0.22, `rgba(${color},0.5)`);
  gradient.addColorStop(0.52, `rgba(${color},0.09)`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  cached.sprites[kind] = sprite;
  return sprite;
}

function validateView(view: ViewBox): void {
  if (!Number.isFinite(view.x0) || !Number.isFinite(view.y0) || !Number.isFinite(view.sizeNm) || view.sizeNm <= 0) {
    throw new RangeError('The physical view must have finite offsets and a positive size');
  }
}

/**
 * Fixed visual glow markers, not uncertainty/Fisher kernels. Marker size and
 * color reproduce the original lab; all scientific coordinates remain in nm.
 * x0/y0 are physical view offsets, so no camera half-pixel offset is added here.
 */
export function drawLocalizationCloud(
  canvas: HTMLCanvasElement,
  positions: readonly { x: number; y: number }[],
  view: ViewBox,
  options: LabCanvasOptions & { truth?: boolean } = {},
): void {
  validateView(view);
  const viewport = prepare(canvas, options);
  if (!viewport) return;
  const { ctx, side, left, top, scaleX, scaleY } = viewport;
  const scale = side / view.sizeNm;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, side, side);
  ctx.clip();

  // Original quarter-field spacing, anchored to physical zero so panning moves
  // the grid with the specimen instead of leaving it attached to the canvas.
  const spacing = view.sizeNm / 4;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 0.6;
  for (let index = 0; index < 4; index++) {
    const gridX = (Math.floor(view.x0 / spacing) + 1 + index) * spacing;
    const gridY = (Math.floor(view.y0 / spacing) + 1 + index) * spacing;
    ctx.beginPath();
    if (gridX < view.x0 + view.sizeNm) {
      const x = left + (gridX - view.x0) * scale;
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + side);
    }
    if (gridY < view.y0 + view.sizeNm) {
      const y = top + (gridY - view.y0) * scale;
      ctx.moveTo(left, y);
      ctx.lineTo(left + side, y);
    }
    ctx.stroke();
  }

  const truth = options.truth === true;
  const sprite = glowSprite(canvas, truth ? 'truth' : 'reconstruction');
  if (sprite) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    // Markers are a fixed fraction of the field on every screen; the floor keeps
    // them visible in device pixels without enlarging them on dense displays.
    const radius = Math.max(1.5 / Math.min(scaleX, scaleY), (side / 64) * (truth ? 0.3 : 0.28));
    for (const point of positions) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const x = left + (point.x - view.x0) * scale;
      const y = top + (point.y - view.y0) * scale;
      if (x + radius < left || x - radius > left + side || y + radius < top || y - radius > top + side) continue;
      ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  ctx.restore();
}

/**
 * Draw an already contrast-mapped camera frame; this never normalizes raw photons.
 * The optional physical crop only changes the display, not the scientific frame.
 */
export function drawCameraPreview(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array | null,
  cameraWidth = 64,
  cameraHeight = 64,
  options: LabCameraOptions = {},
): void {
  if (!Number.isInteger(cameraWidth) || !Number.isInteger(cameraHeight) || cameraWidth <= 0 || cameraHeight <= 0) {
    throw new RangeError('Camera dimensions must be positive integers');
  }
  if (pixels !== null && pixels.length !== cameraWidth * cameraHeight) {
    throw new RangeError('Camera pixel count must match its dimensions');
  }
  if ((options.view === undefined) !== (options.pixelSizeNm === undefined)) {
    throw new RangeError('A camera crop requires both view and pixelSizeNm');
  }
  let crop: { x: number; y: number; size: number } | undefined;
  if (options.view !== undefined) {
    validateView(options.view);
    const pixelSize = options.pixelSizeNm;
    if (pixelSize === undefined || !Number.isFinite(pixelSize) || pixelSize <= 0) {
      throw new RangeError('Camera pixelSizeNm must be finite and positive');
    }
    crop = {
      x: options.view.x0 / pixelSize,
      y: options.view.y0 / pixelSize,
      size: options.view.sizeNm / pixelSize,
    };
  }
  const viewport = prepare(canvas, options);
  if (!viewport) return;
  const { ctx, side, left, top, scaleX, scaleY } = viewport;
  // Put the image's outer edges on whole device pixels, so nearest-neighbour
  // camera pixels are not softened at the borders or shifted by a fraction.
  const drawSnapped = (
    source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number,
    x: number, y: number, w: number, h: number,
  ) => {
    const x0 = Math.round(x * scaleX) / scaleX;
    const y0 = Math.round(y * scaleY) / scaleY;
    const x1 = Math.round((x + w) * scaleX) / scaleX;
    const y1 = Math.round((y + h) * scaleY) / scaleY;
    if (x1 > x0 && y1 > y0) ctx.drawImage(source, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
  };
  // Preserve rectangular camera frames' aspect ratio inside the square field.
  const cameraScale = side / Math.max(cameraWidth, cameraHeight);
  const width = cameraWidth * cameraScale;
  const height = cameraHeight * cameraScale;
  canvas.parentElement?.style.setProperty('--field-side', `${crop ? side : width}px`);
  if (!pixels) return;
  const cached = canvasResources(canvas);
  if (!cached.camera || cached.camera.canvas.width !== cameraWidth || cached.camera.canvas.height !== cameraHeight) {
    const buffer = canvas.ownerDocument.createElement('canvas');
    buffer.width = cameraWidth;
    buffer.height = cameraHeight;
    const context = buffer.getContext('2d');
    if (!context) return;
    cached.camera = { canvas: buffer, context, image: context.createImageData(cameraWidth, cameraHeight) };
  }
  const camera = cached.camera;
  camera.image.data.set(colorizeLabCamera(pixels));
  camera.context.putImageData(camera.image, 0, 0);
  ctx.imageSmoothingEnabled = options.smooth === true;
  if (crop) {
    // Preserve fractional source-pixel offsets. Regions beyond the camera remain
    // navy, with the visible portion occupying its true position in the nm view.
    const sourceX = Math.max(0, crop.x);
    const sourceY = Math.max(0, crop.y);
    const sourceWidth = Math.min(cameraWidth, crop.x + crop.size) - sourceX;
    const sourceHeight = Math.min(cameraHeight, crop.y + crop.size) - sourceY;
    if (sourceWidth <= 0 || sourceHeight <= 0) return;
    drawSnapped(
      camera.canvas, sourceX, sourceY, sourceWidth, sourceHeight,
      left + ((sourceX - crop.x) / crop.size) * side,
      top + ((sourceY - crop.y) / crop.size) * side,
      (sourceWidth / crop.size) * side, (sourceHeight / crop.size) * side,
    );
  } else {
    drawSnapped(
      camera.canvas, 0, 0, cameraWidth, cameraHeight,
      left + (side - width) / 2, top + (side - height) / 2, width, height,
    );
  }
}
