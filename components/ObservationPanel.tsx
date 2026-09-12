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
import { FieldScale } from './FieldScale';
import type { LiveUpdate } from '@/lib/simulator/runSimulation';
import type {
  GroundTruth,
  SimulationParams,
  SimulationResult,
  ViewBox,
} from '@/lib/simulator/types';

type Props = {
  truth: GroundTruth | null;
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
  view,
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
  const [cameraView, setCameraView] = useState<'frame' | 'mean'>('frame');
  const [showTruth, setShowTruth] = useState(false);
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
        showTruth ? (truth?.emitters ?? []) : positions,
        view,
        { truth: showTruth },
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
    showTruth,
    truth,
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
      showTruth ? (truth?.emitters ?? []) : positions,
      view,
      { truth: showTruth, width: size, height: size },
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
      `${showTruth ? 'Ground truth' : 'STORM reconstruction'} · frame ${shownFrame} / ${framesCompleted} · ${showTruth ? (truth?.emitters.length ?? 0) : nShown} positions`,
      24,
      size + 30,
    );
    ctx.font = '15px sans-serif';
    ctx.fillText(
      `View ${view.sizeNm} nm · fixed display markers · known drift correction ${showTruth ? 'not applicable' : correctDrift ? 'on' : 'off'}`,
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
          showTruth ? 'storm-ground-truth.png' : 'storm-reconstruction.png',
        );
    }, 'image/png');
  };
  const fitError = result?.metrics.rmsPerAxisErrorNm;

  return (
    <>
      <div className="image-grid">
        <figure className="image-panel reconstruction-panel">
          <figcaption>
            <h3>{showTruth ? 'Ground truth' : 'STORM reconstruction'}</h3>
            <span>
              {showTruth
                ? `${truth?.emitters.length.toLocaleString() ?? 0} emitters`
                : `${nShown.toLocaleString()} localizations`}
            </span>
          </figcaption>
          <div className="microscopy-field main-field">
            <canvas
              ref={cloud}
              role="img"
              aria-label={
                showTruth
                  ? 'Synthetic emitter positions in the sample'
                  : `STORM reconstruction through frame ${shownFrame}, with known drift correction ${correctDrift ? 'on' : 'off'}`
              }
            />
            <div className="field-top">
              <button
                className="field-icon"
                aria-label="Save image as PNG"
                onClick={saveImage}
                disabled={running || (showTruth ? !truth : !nShown)}
              >
                PNG <Download />
              </button>
            </div>
            <FieldScale view={view} />
            {!showTruth && !framesCompleted && (
              <div className="empty-field">
                {running ? 'Acquiring camera frames…' : 'Run an experiment'}
              </div>
            )}
            {!showTruth && framesCompleted > 0 && nShown === 0 && (
              <div className="empty-field">
                No accepted localizations in these frames
              </div>
            )}
          </div>
          <div className="view-options">
            <div
              className="segmented-control"
              role="group"
              aria-label="Main image"
            >
              <button
                aria-pressed={!showTruth}
                onClick={() => setShowTruth(false)}
              >
                Reconstruction
              </button>
              <button
                aria-pressed={showTruth}
                onClick={() => setShowTruth(true)}
              >
                Ground truth
              </button>
            </div>
            <label className="switch-label">
              <input
                type="checkbox"
                checked={correctDrift}
                onChange={(event) => onDriftChange(event.target.checked)}
                disabled={showTruth}
              />
              Correct known drift
            </label>
          </div>
        </figure>
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
                  ? `Mean of ${framesCompleted.toLocaleString()} frames`
                  : shownFrame
                    ? `Frame ${shownFrame}`
                    : 'Not acquired'}
              </span>
            </figcaption>
            <div className="microscopy-field reference-field">
              <canvas
                ref={camera}
                role="img"
                aria-label={
                  cameraView === 'mean'
                    ? `Mean of all ${framesCompleted} acquired camera frames`
                    : `Simulated camera image for frame ${shownFrame}`
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
            </div>
          </figure>
        </div>
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
      </dl>
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
