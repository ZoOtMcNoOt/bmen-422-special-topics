'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play } from 'lucide-react';
import {
  drawCameraPreview,
  drawLocalizationCloud,
} from '@/lib/rendering/labCanvas';
import { pickScaleBar } from '@/lib/rendering/scaleBar';
import { computeDriftAtFrame } from '@/lib/simulator/drift';
import { locsThroughFrame } from '@/lib/timeline';
import { downloadBlob } from '@/lib/export';
import { ConventionalView } from './ConventionalView';
import { SpecimenView } from './SpecimenView';
import { FieldScale } from './FieldScale';
import type { LiveUpdate } from '@/lib/simulator/runSimulation';
import type {
  GroundTruth,
  GroundTruthInput,
  SimulationParams,
  SimulationResult,
  ViewBox,
} from '@/lib/simulator/types';

type Props = {
  truth: GroundTruth | null;
  specimen: GroundTruthInput | null;
  seed: number;
  view: ViewBox;
  params: SimulationParams;
  result: SimulationResult | null;
  live: LiveUpdate | null;
  activePerFrame: readonly number[];
  countsPerFrame: readonly number[];
  running: boolean;
  correctDrift: boolean;
  onDriftChange: (correct: boolean) => void;
};

/** One timeline drives the reconstruction, camera frame, and frame counts. */
export function ObservationPanel({
  truth,
  specimen,
  seed,
  view: fullView,
  params,
  result,
  live,
  activePerFrame,
  countsPerFrame,
  running,
  correctDrift,
  onDriftChange,
}: Props) {
  const cloud = useRef<HTMLCanvasElement>(null);
  const camera = useRef<HTMLCanvasElement>(null);
  const [requestedCameraView, setCameraView] = useState<'frame' | 'mean' | null>(null);
  // Show blinking during acquisition and the collected image when it finishes.
  // An explicit user choice remains in force for this acquisition.
  const cameraView = requestedCameraView ?? (running ? 'frame' : 'mean');
  const [zoom, setZoom] = useState(1);
  const view = useMemo(() => ({
    x0: fullView.x0 + fullView.sizeNm * (1 - 1 / zoom) / 2,
    y0: fullView.y0 + fullView.sizeNm * (1 - 1 / zoom) / 2,
    sizeNm: fullView.sizeNm / zoom,
  }), [fullView, zoom]);
  const [scrubFrame, setScrubFrame] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const scrubRef = useRef<number | null>(null);
  const framesCompleted = result?.framesCompleted ?? live?.framesCompleted ?? 0;
  const shownFrame = running
    ? framesCompleted
    : Math.min(scrubFrame ?? framesCompleted, framesCompleted);
  const localizations = result?.rawLocalizations ?? live?.localizations;
  const counts = useMemo(
    () => locsThroughFrame(localizations ?? [], framesCompleted),
    [localizations, framesCompleted],
  );
  const nShown = counts[shownFrame] ?? 0;
  const positions = useMemo(
    () =>
      (localizations ?? []).slice(0, nShown).map((loc) => {
        // Live positions already follow the acquisition setting. Final raw fits do not.
        const correction =
          Number(correctDrift) - Number(!result && params.correctDrift);
        if (!correction) return loc;
        const drift = computeDriftAtFrame(
          loc.frameIndex,
          params.driftRateNmPerFrame,
        );
        return {
          ...loc,
          x: loc.x - correction * drift.x,
          y: loc.y - correction * drift.y,
        };
      }),
    [
      localizations,
      nShown,
      correctDrift,
      result,
      params.correctDrift,
      params.driftRateNmPerFrame,
    ],
  );
  const width = params.fieldSizePx.width;
  const height = params.fieldSizePx.height;
  const selectedCamera = useMemo(() => {
    if (!shownFrame) return null;
    if (!result) return live?.cameraFrame ?? null;
    const start = (shownFrame - 1) * width * height;
    return result.cameraFrames.subarray(start, start + width * height);
  }, [result, live, shownFrame, width, height]);
  const widefield = result?.widefield ?? live?.widefield ?? null;
  const draw = useCallback(() => {
    if (cloud.current)
      drawLocalizationCloud(
        cloud.current,
        positions,
        view,
      );
    const options = { view, pixelSizeNm: params.pixelSizeNm };
    if (camera.current)
      drawCameraPreview(
        camera.current,
        cameraView === 'mean' ? widefield : selectedCamera,
        width,
        height,
        options,
      );
  }, [
    positions,
    view,
    selectedCamera,
    cameraView,
    widefield,
    width,
    height,
    params.pixelSizeNm,
  ]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    for (const ref of [cloud, camera])
      if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [draw]);

  const setFrame = (frame: number | null) => {
    scrubRef.current = frame;
    setScrubFrame(frame);
  };
  useEffect(() => {
    if (!playing || running) return;
    const stride = Math.max(1, Math.round(framesCompleted / 200));
    const timer = setInterval(
      () => {
        const next = Math.min(
          (scrubRef.current ?? 0) + stride,
          framesCompleted,
        );
        setFrame(next);
        if (next >= framesCompleted) setPlaying(false);
      },
      1000 / (24 * speed),
    );
    return () => clearInterval(timer);
  }, [playing, running, framesCompleted, speed]);

  const saveImage = () => {
    const output = document.createElement('canvas');
    const field = document.createElement('canvas');
    const size = 1024;
    drawLocalizationCloud(
      field,
      positions,
      view,
      { width: size, height: size },
    );
    output.width = size;
    output.height = size + 110;
    const ctx = output.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(field, 0, 0);
    const bar = pickScaleBar(view.sizeNm);
    ctx.fillStyle = '#d2d9e5';
    ctx.fillRect(24, size - 46, bar.fraction * size, 4);
    ctx.font = '18px sans-serif';
    ctx.fillText(bar.label, 24, size - 16);
    ctx.fillText(
      `STORM reconstruction · frame ${shownFrame} / ${framesCompleted} · ${nShown} positions`,
      24,
      size + 30,
    );
    ctx.font = '15px sans-serif';
    ctx.fillText(
      `View ${view.sizeNm} nm · seed ${seed} · known drift correction ${correctDrift ? 'on' : 'off'}`,
      24,
      size + 58,
    );
    ctx.fillText(
      `PSF σ ${params.psfSigmaNm} nm · pixel ${params.pixelSizeNm} nm · ${params.photonsPerCycle} photons/active frame`,
      24,
      size + 86,
    );
    output.toBlob((blob) => {
      if (blob)
        downloadBlob(
          blob,
          'storm-reconstruction.png',
        );
    }, 'image/png');
  };
  const fitError = result?.metrics.rmsPerAxisErrorNm;

  return (
    <>
      <div className="comparison-toolbar">
        <span>Each view shows the same area</span>
        <label>
          View
          <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            <option value={1}>Whole object</option>
            <option value={2}>2× center crop</option>
            <option value={4}>4× center crop</option>
          </select>
        </label>
      </div>
      <div className="image-grid">
        <SpecimenView specimen={specimen} truth={truth} view={view} />
        <figure className="image-panel reconstruction-panel">
          <figcaption>
            <h3>STORM reconstruction</h3>
            <span>{nShown.toLocaleString()} localizations</span>
          </figcaption>
          <div className="microscopy-field main-field">
            <canvas
              ref={cloud}
              role="img"
              aria-label={
                `STORM reconstruction through frame ${shownFrame}, with known drift correction ${correctDrift ? 'on' : 'off'}`
              }
            />
            <div className="field-top">
              <button
                className="field-icon"
                aria-label="Save image as PNG"
                onClick={saveImage}
                disabled={running || !nShown}
              >
                PNG <Download />
              </button>
            </div>
            <FieldScale view={view} />
            {!framesCompleted && (
              <div className="empty-field">
                {running ? 'Acquiring camera frames…' : 'Run an experiment'}
              </div>
            )}
            {framesCompleted > 0 && nShown === 0 && (
              <div className="empty-field">
                {shownFrame === 0 ? 'Before the first frame' : 'No accepted fits in these frames'}
              </div>
            )}
          </div>
          <div className="view-options">
            <label className="switch-label">
              <input
                type="checkbox"
                checked={correctDrift}
                onChange={(event) => onDriftChange(event.target.checked)}
              />
              Correct known drift
            </label>
          </div>
        </figure>
      </div>
        <div className="reference-views">
          <ConventionalView
            truth={truth}
            view={view}
            psfSigmaNm={params.psfSigmaNm}
          />
          <figure className="image-panel">
            <figcaption>
              <h3>STORM camera</h3>
              <span>
                {cameraView === 'mean'
                  ? framesCompleted
                    ? `Mean of ${framesCompleted.toLocaleString()} frames`
                    : 'Not acquired'
                  : shownFrame
                    ? `Frame ${shownFrame}`
                    : framesCompleted ? 'Before frame 1' : 'Not acquired'}
              </span>
            </figcaption>
            <div className="microscopy-field reference-field">
              <canvas
                ref={camera}
                role="img"
                aria-label={
                  cameraView === 'mean'
                    ? framesCompleted
                      ? `Mean of all ${framesCompleted} acquired camera frames`
                      : 'No acquired camera frames to average'
                    : shownFrame
                      ? `Simulated camera image for frame ${shownFrame}`
                      : 'No camera frame selected'
                }
              />
              <FieldScale view={view} />
            </div>
            <div className="view-options camera-options">
              <div
                className="segmented-control"
                role="group"
                aria-label="STORM camera view"
              >
                <button
                  aria-label="Single frame"
                  aria-pressed={cameraView === 'frame'}
                  onClick={() => setCameraView('frame')}
                >
                  Frame
                </button>
                <button
                  aria-label="All-frame mean"
                  aria-pressed={cameraView === 'mean'}
                  onClick={() => setCameraView('mean')}
                >
                  Mean
                </button>
              </div>
              <span className="image-note">{params.pixelSizeNm} nm camera pixels</span>
            </div>
          </figure>
        </div>
      <div className="playback-panel">
        <button
          className="play-button"
          aria-label={playing ? 'Pause playback' : 'Play acquisition'}
          disabled={running || !framesCompleted}
          onClick={() => {
            if (!playing && shownFrame >= framesCompleted) setFrame(0);
            setPlaying((value) => !value);
          }}
        >
          {playing ? <Pause /> : <Play />}
        </button>
        <div className="timeline">
          <div className="timeline-heading">
            <label htmlFor="frame-slider">Frame</label>
            <output htmlFor="frame-slider">
              {shownFrame.toLocaleString()} / {framesCompleted.toLocaleString()}
            </output>
          </div>
          <ActivityChart counts={countsPerFrame} shownFrame={shownFrame} />
          <input
            id="frame-slider"
            type="range"
            min="0"
            max={Math.max(1, framesCompleted)}
            step="1"
            value={shownFrame}
            disabled={running || !framesCompleted}
            onChange={(event) => {
              setPlaying(false);
              setFrame(Number(event.target.value));
            }}
          />
        </div>
        <label className="speed-control">
          Playback
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
      </div>
      {running && (
        <progress
          className="acquisition-progress"
          aria-label="Acquisition progress"
          value={framesCompleted}
          max={params.nFrames}
        />
      )}
      <dl className="lab-metrics" aria-label="Acquisition measurements">
        <div>
          <dt>Localizations</dt>
          <dd>{nShown.toLocaleString()}</dd>
          <small>
            {shownFrame
              ? `${countsPerFrame[shownFrame - 1] ?? 0} in frame ${shownFrame}`
              : 'Through the selected frame'}
          </small>
        </div>
        <div>
          <dt>Matched fit error</dt>
          <dd>
            {fitError == null ? '—' : fitError.toFixed(1)} <em>nm</em>
          </dd>
          <small>RMS per axis · full acquisition</small>
        </div>
        <div>
          <dt>Active emitters</dt>
          <dd>
            {shownFrame
              ? (activePerFrame[shownFrame - 1] ?? 0).toLocaleString()
              : '—'}
          </dd>
          <small>
            {shownFrame ? `In frame ${shownFrame}` : 'In the selected frame'}
          </small>
        </div>
        <div>
          <dt>Detection recall</dt>
          <dd>{result?.metrics.detectionRecall == null ? '—' : `${(100 * result.metrics.detectionRecall).toFixed(0)}%`}</dd>
          <small>Active emitter-frames matched</small>
        </div>
      </dl>
      {result && result.rawLocalizations.length === 0 && (
        <p className="mb-5 text-xs leading-relaxed text-muted-foreground" role="status">
          {result.metrics.activeEmitterFrames === 0
            ? 'No active molecules were recorded in the field. Try more frames or higher activation.'
            : 'No spots passed the single-molecule checks. Try fewer active molecules or a higher photon yield.'}
        </p>
      )}
    </>
  );
}

function ActivityChart({
  counts,
  shownFrame,
}: {
  counts: readonly number[];
  shownFrame: number;
}) {
  // Max-pool only the visual bars; the timeline and numerical counts keep every frame.
  const stride = Math.max(1, Math.ceil(counts.length / 160));
  const bins = [];
  for (let i = 0; i < counts.length; i += stride) {
    let peak = 0;
    for (let j = i; j < Math.min(i + stride, counts.length); j++)
      peak = Math.max(peak, counts[j]);
    bins.push({ peak, start: i });
  }
  const max = Math.max(1, ...bins.map((bin) => bin.peak));
  return (
    <svg
      className="activity-chart"
      viewBox={`0 0 ${Math.max(1, bins.length)} 25`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bins.map((bin, index) => (
        <rect
          key={index}
          x={index}
          y={25 - (23 * bin.peak) / max}
          width="0.8"
          height={(23 * bin.peak) / max}
          fill={bin.start < shownFrame ? '#bdb0e8' : '#e4e6ee'}
        />
      ))}
    </svg>
  );
}
