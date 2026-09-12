/** Canvas rendering only. Coordinates remain in camera pixels, with integer centers. */
const FIELD = "#0b1020";
const COLORS = { reconstruction: [79, 222, 193], truth: [239, 190, 113] };

export function decodePixels(encoded) {
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function viewport(canvas) {
  const bounds = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * dpr));
  const height = Math.max(1, Math.round(bounds.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = FIELD;
  ctx.fillRect(0, 0, bounds.width, bounds.height);
  const side = Math.min(bounds.width, bounds.height);
  const left = (bounds.width - side) / 2;
  const top = (bounds.height - side) / 2;
  canvas.parentElement.style.setProperty("--scale-width", `${side / 6.4}px`);
  return { ctx, side, left, top, width: bounds.width, height: bounds.height };
}

function glowSprite(color) {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 32;
  const ctx = sprite.getContext("2d");
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, `rgba(${color.join(",")},0.9)`);
  gradient.addColorStop(0.22, `rgba(${color.join(",")},0.5)`);
  gradient.addColorStop(0.52, `rgba(${color.join(",")},0.09)`);
  gradient.addColorStop(1, `rgba(${color.join(",")},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  return sprite;
}

const sprites = Object.fromEntries(
  Object.entries(COLORS).map(([key, color]) => [key, glowSprite(color)]),
);

export function drawReconstruction(
  canvas,
  experiment,
  frame,
  { view, correctDrift },
) {
  const { ctx, side, left, top } = viewport(canvas);
  if (!experiment) return;
  const scale = side / experiment.model.canvas_size_px;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, side, side);
  ctx.clip();
  // Quiet reference grid aligned to the physical field, behind the observations.
  ctx.strokeStyle = "#151c2e";
  ctx.lineWidth = 0.6;
  for (let i = 16; i < 64; i += 16) {
    ctx.beginPath();
    ctx.moveTo(left + i * scale, top);
    ctx.lineTo(left + i * scale, top + side);
    ctx.moveTo(left, top + i * scale);
    ctx.lineTo(left + side, top + i * scale);
    ctx.stroke();
  }
  const truth = view === "truth";
  const points = truth
    ? experiment.ground_truth
    : correctDrift
      ? experiment.localizations.corrected_xy
      : experiment.localizations.xy;
  ctx.globalCompositeOperation = "lighter";
  const sprite = sprites[truth ? "truth" : "reconstruction"];
  const radius = Math.max(1.5, scale * (truth ? 0.3 : 0.28));
  for (let index = 0; index < points.length; index++) {
    if (!truth && experiment.localizations.frame[index] >= frame) break;
    const [x, y] = points[index];
    ctx.drawImage(
      sprite,
      left + (x + 0.5) * scale - radius,
      top + (y + 0.5) * scale - radius,
      radius * 2,
      radius * 2,
    );
  }
  ctx.restore();
}

const imageBuffer = document.createElement("canvas");
imageBuffer.width = imageBuffer.height = 64;
const imageContext = imageBuffer.getContext("2d");
const pixels = imageContext.createImageData(64, 64);

export function drawCamera(canvas, values, offset = 0) {
  const { ctx, side, left, top } = viewport(canvas);
  if (!values) return;
  for (let i = 0; i < 4096; i++) {
    const intensity = Math.pow(values[i + offset] / 255, 0.86);
    const highlight = Math.max(0, (intensity - 0.5) * 2);
    pixels.data[i * 4] = 11 + 174 * intensity + 64 * highlight;
    pixels.data[i * 4 + 1] = 16 + 100 * intensity + 125 * highlight;
    pixels.data[i * 4 + 2] = 32 + 206 * intensity;
    pixels.data[i * 4 + 3] = 255;
  }
  imageContext.putImageData(pixels, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(imageBuffer, left, top, side, side);
}

export function drawActivity(canvas, counts, frame) {
  const bounds = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(bounds.width * dpr));
  canvas.height = Math.max(1, Math.round(bounds.height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  if (!counts) return;
  const max = Math.max(1, ...counts);
  const width = bounds.width / counts.length;
  counts.forEach((count, i) => {
    const height = (count / max) * (bounds.height - 2);
    ctx.fillStyle = i < frame ? "#b4a4e6" : "#e7e3f1";
    ctx.fillRect(
      i * width,
      bounds.height - height,
      Math.max(0.6, width - 1),
      height,
    );
  });
}

/** Save an opaque, physically scaled view with provenance inside the exported image. */
export function imageSnapshot(canvas, experiment, frame, view, correctDrift) {
  const copy = document.createElement("canvas");
  // Keep provenance readable even when saving from a narrow mobile viewport.
  copy.width = Math.max(1024, canvas.width);
  const imageHeight = Math.round((canvas.height * copy.width) / canvas.width);
  copy.height = imageHeight + 80;
  const ctx = copy.getContext("2d");
  ctx.fillStyle = FIELD;
  ctx.fillRect(0, 0, copy.width, copy.height);
  ctx.drawImage(canvas, 0, 0, copy.width, imageHeight);
  const barWidth = Math.min(copy.width, imageHeight) / 6.4;
  ctx.fillStyle = "#d8dfec";
  ctx.fillRect(24, imageHeight - 34, barWidth, 3);
  ctx.font = "12px sans-serif";
  ctx.fillText("1 μm", 24, imageHeight - 13);
  ctx.fillText(
    `STORM Lab · synthetic ${experiment.settings.specimen} · seed ${experiment.settings.seed}`,
    24,
    imageHeight + 27,
  );
  ctx.fillStyle = "#9ca7bd";
  ctx.fillText(
    `${view === "truth" ? "Ground truth" : "Reconstruction"} · frame ${frame}/${experiment.settings.frame_count} · ${view === "truth" ? "reference coordinates" : correctDrift ? "known drift corrected" : "uncorrected"}`,
    24,
    imageHeight + 51,
  );
  return copy;
}
