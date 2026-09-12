/** Reproduce preset reconstruction behavior with identical camera pixels in both fitters.
 * Run: node validation/reconstruction-audit.mjs
 * Requires the repository history containing BASELINE and the installed npm dependencies.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = '7d21398be792fb574d8227568be7bc0ac20437cf';
const SEEDS = [42, 20260912, 987654321];
const externalRequire = createRequire(path.join(ROOT, 'package.json'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sourceHash = text => sha256(text.replaceAll('\r\n', '\n'));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/** Separate CommonJS module graphs keep the historical and current implementations isolated. */
function sourceLoader(revision = null) {
  const cache = new Map();
  const hashes = {};
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = revision ? git('show', `${revision}:${filename}`) : readFileSync(path.join(ROOT, filename), 'utf8');
    hashes[filename] = sourceHash(source);
    const moduleRecord = { exports: {} };
    cache.set(filename, moduleRecord);
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText;
    const localRequire = request => {
      if (!request.startsWith('.') && !request.startsWith('@/')) return externalRequire(request);
      const target = request.startsWith('@/') ? request.slice(2) : path.posix.join(path.posix.dirname(filename), request);
      return load(target.endsWith('.ts') ? target : `${target}.ts`);
    };
    new Function('require', 'module', 'exports', compiled)(localRequire, moduleRecord, moduleRecord.exports);
    return moduleRecord.exports;
  }
  return { load, hashes };
}

const current = sourceLoader();
const historical = sourceLoader(BASELINE);
const { DEFAULT_PARAMS, FIELD_SIZE_NM } = current.load('lib/simulator/defaults.ts');
const { PRESETS, viewBoxFor } = current.load('lib/presets.ts');
const historicalPresets = historical.load('lib/presets.ts');
const truthApi = current.load('lib/simulator/groundTruth.ts');
const historicalTruth = historical.load('lib/simulator/groundTruth.ts');
const { seededRandom } = current.load('lib/simulator/random.ts');
const FIELD = { width: FIELD_SIZE_NM, height: FIELD_SIZE_NM };
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const quantile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
};
const emptyTotals = () => ({ matchedCount: 0, activeEmitterFrames: 0, falsePositiveCount: 0, squaredErrorSumNm2: 0 });

function engine(loader) {
  const analysis = loader.load('lib/simulator/analysis.ts');
  const fitting = loader.load('lib/simulator/localization.ts');
  const originalMatch = analysis.matchFrameLocalizations;
  const originalFit = fitting.localizeFrame;
  let capture;
  fitting.localizeFrame = (frame, params) => {
    capture.cameraHash.update(Buffer.from(frame.pixels.buffer, frame.pixels.byteOffset, frame.pixels.byteLength));
    return originalFit(frame, params);
  };
  analysis.matchFrameLocalizations = (fits, active, ...args) => {
    const totals = originalMatch(fits, active, ...args);
    const group = active.length === 0 ? capture.empty : active.length === 1 ? capture.single : capture.multiple;
    group.frames++;
    for (const key of Object.keys(totals)) group.totals[key] += totals[key];
    for (const point of active) capture.everOn.add(`${point.x},${point.y}`);
    return totals;
  };
  const { runSimulation } = loader.load('lib/simulator/runSimulation.ts');
  return async (truth, params, seed) => {
    capture = {
      cameraHash: createHash('sha256'), everOn: new Set(),
      empty: { frames: 0, totals: emptyTotals() },
      single: { frames: 0, totals: emptyTotals() },
      multiple: { frames: 0, totals: emptyTotals() },
    };
    const result = await runSimulation(truth, params, { rng: seededRandom(seed ^ 0xa5a5a5a5) });
    const groups = Object.fromEntries(['empty', 'single', 'multiple'].map(key => [key, {
      frames: capture[key].frames, ...analysis.summarizeMatches(capture[key].totals, params.psfSigmaNm),
    }]));
    return { result, groups, cameraSha256: capture.cameraHash.digest('hex'), everOn: capture.everOn.size };
  };
}
const runHistorical = engine(historical);
const runCurrent = engine(current);

// A very thin source retains its original 1024:1 aspect ratio after downsampling
// to a 256x1 sampling buffer. Invisible pixels deliberately have bright RGB.
const imagePixels = { width: 256, height: 1, data: new Uint8ClampedArray(256 * 4) };
for (let x = 0; x < 256; x++) imagePixels.data.set([255, 255, 255, x >= 64 && x < 192 ? 255 : 0], x * 4);
const thinImage = { width: 4096, height: 4, pixels: imagePixels };
const imageSupport = { xLow: 2560, xHigh: 7680, yLow: 5115, yHigh: 5125 };
function imageDistance(point) {
  const dx = Math.max(imageSupport.xLow - point.x, 0, point.x - imageSupport.xHigh);
  const dy = Math.max(imageSupport.yLow - point.y, 0, point.y - imageSupport.yHigh);
  return Math.hypot(dx, dy);
}
function shapeDistance(kind, point) {
  if (kind === 'image') return imageDistance(point);
  const x = point.x - FIELD_SIZE_NM / 2;
  const y = point.y - FIELD_SIZE_NM / 2;
  if (kind === 'ring') return Math.abs(Math.hypot(x, y) - 30);
  if (kind === 'two-lines') return Math.hypot(Math.max(0, Math.abs(x) - 1500), Math.abs(Math.abs(y) - 25));
  let dx = Infinity;
  for (let rung = 0; rung < 10; rung++) dx = Math.min(dx, Math.abs(x - (-855 + rung * 190)));
  return Math.hypot(dx, Math.max(0, Math.abs(y) - 200));
}
function summarize(acquisition, kind, truth, view) {
  const { result, groups, cameraSha256, everOn } = acquisition;
  const fits = result.rawLocalizations;
  const distances = fits.map(fit => shapeDistance(kind, fit));
  const inside = point => point.x >= view.x0 && point.x < view.x0 + view.sizeNm && point.y >= view.y0 && point.y < view.y0 + view.sizeNm;
  const radii = fits.map(fit => Math.hypot(fit.x - FIELD_SIZE_NM / 2, fit.y - FIELD_SIZE_NM / 2));
  assert.equal(result.countsPerFrame.reduce((sum, n) => sum + n, 0), fits.length);
  return {
    cameraSha256, frames: result.framesCompleted, labelsEverOn: everOn,
    fractionLabelsEverOn: everOn / truth.emitters.length,
    meanActive: result.activePerFrame.reduce((sum, n) => sum + n, 0) / result.framesCompleted,
    acceptedFits: fits.length, ...result.metrics,
    medianFittedPhotons: quantile(fits.map(fit => fit.nPhotons), 0.5),
    p90FittedPhotons: quantile(fits.map(fit => fit.nPhotons), 0.9),
    medianThompsonNm: result.apparentSigmaLocNm,
    shape: {
      medianDistanceNm: quantile(distances, 0.5), p90DistanceNm: quantile(distances, 0.9),
      rmsDistanceNm: distances.length ? Math.sqrt(distances.reduce((sum, d) => sum + d * d, 0) / distances.length) : null,
      fractionWithin10Nm: ratio(distances.filter(d => d <= 10).length, fits.length),
    },
    framing: { view, labelsInView: truth.emitters.filter(inside).length, fitsInView: fits.filter(inside).length },
    groups,
    ...(kind === 'ring' ? { ring: {
      medianRadiusNm: quantile(radii, 0.5), p10RadiusNm: quantile(radii, 0.1), p90RadiusNm: quantile(radii, 0.9),
      fractionInsideRadius15Nm: ratio(radii.filter(r => r < 15).length, fits.length),
    } } : {}),
  };
}

const report = {
  baselineRevision: BASELINE, currentHead: git('rev-parse', 'HEAD').trim(),
  nodeVersion: process.version, typescriptVersion: ts.version,
  auditSha256: sourceHash(readFileSync(fileURLToPath(import.meta.url), 'utf8')),
  seeds: SEEDS, params: DEFAULT_PARAMS,
  method: {
    rng: 'Current seededRandom: label stream seed; independent acquisition stream seed XOR 0xa5a5a5a5, matching the app.',
    pairing: 'Same GroundTruth object and seed supplied to both runSimulation versions. SHA256 over every raw Float32 camera pixel verifies identical observations.',
    provenance: 'Source and audit-script SHA256 hashes normalize CRLF line endings to LF; no other whitespace is changed. Camera hashes cover unmodified binary pixels.',
    acceptance: 'Every current default case must have finite matched RMS/axis below 4 nm, zero unmatched fits, recall at least 50%, and at least 99% of accepted fits within 10 nm of ideal geometry. Crowded controls are diagnostic and exempt.',
    errors: 'Maximum-cardinality minimum-distance one-to-one matching to active truth in the same frame, inclusive one-PSF-sigma gate. RMS per axis is conditional on matched fits.',
    shape: 'Distance to ideal continuous lines, circle, actin segments, or visible image rectangle; not an image-resolution measurement.',
    sampling: 'labelsEverOn counts illuminated labels, including ones missed/rejected by the fitter; it is not unique resolved-molecule coverage.',
    calibration: 'Both engines see equal per-emitter mean brightness. The current quality gates use that known photon mean and known background/PSF; experimental brightness variation is outside this audit.',
  },
  sourceHashes: { historical: historical.hashes, current: current.hashes },
  imageFixture: { sourceSize: { width: thinImage.width, height: thinImage.height }, bufferSize: { width: 256, height: 1 }, visiblePixelColumns: [64, 192], supportNm: imageSupport, labeling: [] },
  cases: [], checks: { identicalCameraPixels: true, allDefaultLabelsInView: true, currentImageLabelsInsideVisibleSupport: true, defaultReconstructionQuality: true, currentSourcesStable: null },
};
const outputOption = process.argv.indexOf('--output');
const outputPath = outputOption >= 0 ? path.resolve(process.argv[outputOption + 1]) : path.join(ROOT, 'build', 'reconstruction-audit.json');
mkdirSync(path.dirname(outputPath), { recursive: true });
const save = () => writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');

async function compare(kind, labels, seed, regime) {
  const input = PRESETS[kind].build(labels, kind === 'image' ? thinImage : null);
  const truth = truthApi.generateGroundTruth(input, FIELD, seededRandom(seed));
  assert.equal(truth.emitters.length, labels);
  const view = viewBoxFor(kind);
  if (kind === 'image') {
    report.checks.currentImageLabelsInsideVisibleSupport &&= truth.emitters.every(point => imageDistance(point) === 0);
    assert.ok(report.checks.currentImageLabelsInsideVisibleSupport, 'Transparent pixels or aspect distortion moved labels outside the visible image');
    const savedRandom = Math.random;
    let oldTruth;
    try {
      Math.random = seededRandom(seed);
      oldTruth = historicalTruth.generateGroundTruth({ kind: 'image', imageData: imagePixels, nEmitters: labels }, FIELD);
    } finally { Math.random = savedRandom; }
    report.imageFixture.labeling.push({ seed, requestedLabels: labels, currentCount: truth.emitters.length,
      currentInsideVisibleSupport: truth.emitters.filter(point => imageDistance(point) === 0).length,
      historicalCount: oldTruth.emitters.length, historicalInsideVisibleSupport: oldTruth.emitters.filter(point => imageDistance(point) === 0).length,
    });
  }
  const before = summarize(await runHistorical(truth, DEFAULT_PARAMS, seed), kind, truth, historicalPresets.viewBoxFor(kind, truth.emitters));
  const after = summarize(await runCurrent(truth, DEFAULT_PARAMS, seed), kind, truth, view);
  const caseReport = { kind, regime, labels, seed, truthSha256: sha256(JSON.stringify(truth)), historical: before, current: after };
  report.cases.push(caseReport);
  report.checks.identicalCameraPixels &&= after.cameraSha256 === before.cameraSha256;
  assert.ok(report.checks.identicalCameraPixels, 'Fitter comparison must use identical raw camera pixels');
  assert.equal(after.labelsEverOn, before.labelsEverOn);
  if (regime === 'preset-default') {
    report.checks.allDefaultLabelsInView &&= after.framing.labelsInView === labels;
    assert.ok(report.checks.allDefaultLabelsInView, 'Default framing must include the full specimen');
    caseReport.qualityChecks = {
      rmsPerAxisBelow4Nm: Number.isFinite(after.rmsPerAxisErrorNm) && after.rmsPerAxisErrorNm < 4,
      noUnmatchedFits: after.falsePositiveCount === 0,
      recallAtLeast50Percent: Number.isFinite(after.detectionRecall) && after.detectionRecall >= 0.5,
      geometryWithin10NmAtLeast99Percent: Number.isFinite(after.shape.fractionWithin10Nm) && after.shape.fractionWithin10Nm >= 0.99,
    };
    report.checks.defaultReconstructionQuality &&= Object.values(caseReport.qualityChecks).every(Boolean);
    assert.ok(report.checks.defaultReconstructionQuality, `${kind}, seed ${seed}: default reconstruction regression ${JSON.stringify(caseReport.qualityChecks)}`);
  }
  save();
  console.log(JSON.stringify({ kind, regime, labels, seed,
    rmsBeforeNm: before.rmsPerAxisErrorNm, rmsAfterNm: after.rmsPerAxisErrorNm,
    recallBefore: before.detectionRecall, recallAfter: after.detectionRecall,
    fitsBefore: before.acceptedFits, fitsAfter: after.acceptedFits, unmatchedAfter: after.falsePositiveCount,
    shapeWithin10NmBefore: before.shape.fractionWithin10Nm, shapeWithin10NmAfter: after.shape.fractionWithin10Nm,
  }));
}

try {
  for (const seed of SEEDS) {
    for (const kind of ['two-lines', 'ring', 'actin', 'image']) await compare(kind, PRESETS[kind].defaultEmitters, seed, 'preset-default');
  }
  for (const kind of ['two-lines', 'ring', 'actin']) await compare(kind, 10000, 42, 'legacy-density-control');
  report.checks.currentSourcesStable = Object.entries(current.hashes).every(([filename, hash]) => sourceHash(readFileSync(path.join(ROOT, filename), 'utf8')) === hash);
  save();
  assert.ok(report.checks.currentSourcesStable, 'Current source changed during the audit; rerun against stable files');
  console.log(`Saved ${report.cases.length} paired acquisitions to ${path.relative(ROOT, outputPath)}`);
} catch (error) {
  report.error = error.message;
  save();
  throw error;
}
