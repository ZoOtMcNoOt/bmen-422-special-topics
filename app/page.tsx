'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Link2,
  Atom,
  RotateCcw,
  Play,
  Square,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ControlPanel } from '@/components/ControlPanel';
import { ObservationPanel } from '@/components/ObservationPanel';
import { PresetPicker } from '@/components/PresetPicker';
import { ThompsonPlot } from '@/components/ThompsonPlot';
import { DEFAULT_PARAMS, FIELD_SIZE_NM } from '@/lib/simulator/defaults';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import { runSimulation, type LiveUpdate } from '@/lib/simulator/runSimulation';
import {
  DEFAULT_DENSITY_PER_UM2,
  DEFAULT_PRESET,
  PRESETS,
  emitterCount,
  viewBoxFor,
  type PresetKind,
} from '@/lib/presets';
import { decodeState, encodeState } from '@/lib/url-state';
import { downloadBlob, localizationCsv } from '@/lib/export';
import type {
  GroundTruth,
  SimulationParams,
  SimulationResult,
  ViewBox,
} from '@/lib/simulator/types';

type LiveAcquisition = LiveUpdate & {
  activeHistory: number[];
  countsHistory: number[];
};
type DisplaySample = {
  truth: GroundTruth;
  view: ViewBox;
  preset: PresetKind;
  params: SimulationParams;
};

export default function Page() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [preset, setPreset] = useState<PresetKind>(DEFAULT_PRESET);
  const [densityPerUm2, setDensity] = useState(DEFAULT_DENSITY_PER_UM2);
  const [image, setImage] = useState<ImageData | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [displaySample, setDisplaySample] = useState<DisplaySample | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveAcquisition | null>(null);
  const [runId, setRunId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    if (window.location.search) {
      const s = decodeState(window.location.search, DEFAULT_PARAMS);
      setParams(s.params);
      setPreset(s.preset);
      setDensity(s.densityPerUm2);
    }
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    const timer = setTimeout(
      () =>
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}?${encodeState({ params, preset, densityPerUm2 })}`,
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [params, preset, densityPerUm2]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const groundTruth = useMemo(() => {
    const input = PRESETS[preset].build(emitterCount(densityPerUm2), image);
    if (!input) return null;
    try {
      return generateGroundTruth(input, {
        width: FIELD_SIZE_NM,
        height: FIELD_SIZE_NM,
      });
    } catch {
      return null;
    }
  }, [preset, densityPerUm2, image]);
  const draftView = useMemo(
    () => viewBoxFor(preset, groundTruth?.emitters),
    [preset, groundTruth],
  );
  const view = displaySample?.view ?? draftView;

  const start = useCallback(async () => {
    if (!groundTruth || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDisplaySample({ truth: groundTruth, view: draftView, preset, params });
    setRunning(true);
    setResult(null);
    setError(null);
    setLive(null);
    setRunId((n) => n + 1);
    try {
      setResult(
        await runSimulation(groundTruth, params, {
          onUpdate: (update) =>
            setLive((previous) => ({
              ...update,
              activeHistory: [
                ...(previous?.activeHistory.slice(
                  0,
                  update.newFrameStats.startFrame,
                ) ?? []),
                ...update.newFrameStats.activePerFrame,
              ],
              countsHistory: [
                ...(previous?.countsHistory.slice(
                  0,
                  update.newFrameStats.startFrame,
                ) ?? []),
                ...update.newFrameStats.countsPerFrame,
              ],
            })),
          signal: controller.signal,
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The acquisition could not finish. Try again.',
      );
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, [groundTruth, params, preset, draftView, running]);

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeState({ params, preset, densityPerUm2 })}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied('idle'), 1800);
  };
  const framesCompleted = result?.framesCompleted ?? live?.framesCompleted ?? 0;
  const displayedParams = displaySample?.params ?? params;
  const isStale =
    displaySample !== null &&
    (displaySample.truth !== groundTruth ||
      !sameAcquisition(displaySample.params, params));
  const needsImage = preset === 'image' && !groundTruth;
  const status = running
    ? `Acquiring ${framesCompleted.toLocaleString()} / ${displayedParams.nFrames.toLocaleString()}`
    : result
      ? result.framesCompleted < result.params.nFrames
        ? 'Stopped'
        : 'Complete'
      : error
        ? 'Acquisition failed'
        : 'Ready';

  return (
    <div className="lab-shell">
      <a href="#observation" className="skip-link">
        Skip to images
      </a>
      <header className="lab-header">
        <h1 className="lab-brand">
          <span className="lab-brand-mark">
            <Atom aria-hidden="true" />
          </span>
          STORM simulator
        </h1>
        <div className="header-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNotesOpen(true);
              dialog.current?.showModal();
            }}
          >
            Model notes
          </Button>
          <Button variant="ghost" size="sm" onClick={copyLink}>
            {copied === 'ok' ? <Check /> : <Link2 />}
            {copied === 'ok'
              ? 'Copied'
              : copied === 'fail'
                ? 'Copy the address bar'
                : 'Copy link'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!result || running}
            onClick={() => {
              if (result)
                downloadBlob(
                  new Blob([localizationCsv(result)], {
                    type: 'text/csv;charset=utf-8',
                  }),
                  'storm-localizations.csv',
                );
            }}
          >
            <Download />
            Export CSV
          </Button>
        </div>
      </header>
      <main className="lab-main">
        <div className="lab-layout">
          <aside className="lab-sidebar" aria-label="Experiment settings">
            <div className="panel-heading">
              <h2>Acquisition</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Reset experiment settings"
                disabled={running}
                onClick={() => {
                  setParams({ ...DEFAULT_PARAMS });
                  setDensity(DEFAULT_DENSITY_PER_UM2);
                  setPreset(DEFAULT_PRESET);
                }}
              >
                <RotateCcw />
              </Button>
            </div>
            <PresetPicker
              value={preset}
              onChange={setPreset}
              onImageLoaded={setImage}
              disabled={running}
            />
            <ControlPanel
              params={params}
              onChange={setParams}
              densityPerUm2={densityPerUm2}
              onDensityChange={setDensity}
              disabled={running}
            />
            <div>
              {running ? (
                <Button
                  variant="outline"
                  onClick={() => abortRef.current?.abort()}
                  className="run-button"
                >
                  <Square className="size-3 fill-current" />
                  Stop acquisition
                </Button>
              ) : (
                <Button
                  onClick={start}
                  disabled={!groundTruth}
                  className="run-button"
                >
                  <Play className="size-3 fill-current" />
                  Run experiment
                </Button>
              )}
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                {needsImage
                  ? 'Choose an image to run.'
                  : isStale
                    ? 'Settings changed. Run to update the images.'
                    : `${params.nFrames.toLocaleString()} frames`}
              </p>
            </div>
          </aside>
          <section
            id="observation"
            className="lab-workspace"
            aria-label="Microscopy images"
            aria-busy={running}
          >
            <div className="observation-toolbar">
              <h2 className="text-sm font-semibold">
                {PRESETS[displaySample?.preset ?? preset].label}
              </h2>
              <span
                role="status"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span
                  className={`size-1.5 rounded-full ${running ? 'bg-primary' : result ? 'bg-emerald-600' : 'bg-slate-400'}`}
                />
                {status}
              </span>
            </div>
            {error && (
              <p role="alert" className="mb-4 text-sm text-destructive">
                {error}
              </p>
            )}
            <ObservationPanel
              key={runId}
              truth={displaySample?.truth ?? groundTruth}
              view={view}
              params={displayedParams}
              result={result}
              live={live}
              activePerFrame={
                result?.activePerFrame ?? live?.activeHistory ?? []
              }
              countsPerFrame={
                result?.countsPerFrame ?? live?.countsHistory ?? []
              }
              running={running}
              correctDrift={params.correctDrift}
              onDriftChange={(correctDrift) =>
                setParams((previous) => ({ ...previous, correctDrift }))
              }
            />
          </section>
        </div>
      </main>
      <dialog
        ref={dialog}
        className="lab-dialog"
        aria-labelledby="model-title"
        onClose={() => setNotesOpen(false)}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="model-title" className="text-lg font-semibold">
            Model notes
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close model notes"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </Button>
        </div>
        <div className="mb-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Two-state blinking, a known Gaussian point-spread function, and a
            Poisson noise model (a normal approximation for pixel means of 30 or
            more). Photon yield is per active molecule per frame. The
            single-emitter fit assumes an isolated spot; overlapping molecules
            can bias it.
          </p>
          <p>
            Fit error is RMS per axis for one-to-one matches to active emitters
            in the same frame, within one PSF sigma. Missed emitters and
            unmatched fits are counted separately. These measurements do not
            establish image resolution.
          </p>
          <p>
            Drift correction subtracts the exact simulated motion. It
            demonstrates ideal correction; it does not estimate motion from the
            images.
          </p>
        </div>
        {result && (
          <p className="mb-5 text-xs text-muted-foreground">
            Full acquisition: {result.metrics.matchedCount.toLocaleString()}{' '}
            matched fits, {result.metrics.missedCount.toLocaleString()} missed
            emitter-frames, and{' '}
            {result.metrics.falsePositiveCount.toLocaleString()} unmatched fits.
            Detection recall:{' '}
            {result.metrics.detectionRecall == null
              ? 'unavailable'
              : `${(result.metrics.detectionRecall * 100).toFixed(1)}%`}
            .
          </p>
        )}
        <p className="mb-5 text-xs text-muted-foreground">
          Point markers have a fixed display size. Camera brightness uses one
          fixed scale for the acquisition; widefield shows the raw mean of all
          acquired frames, normalized separately. Camera images retain stage
          drift.
        </p>
        {notesOpen && <ThompsonPlot params={displayedParams} result={result} />}
        <p className="mt-5 text-xs text-muted-foreground">
          Precision approximation:{' '}
          <a
            className="underline"
            href="https://doi.org/10.1016/S0006-3495(02)75618-X"
            target="_blank"
            rel="noreferrer"
          >
            Thompson, Larson &amp; Webb (2002)
          </a>
          .
        </p>
      </dialog>
    </div>
  );
}

function sameAcquisition(a: SimulationParams, b: SimulationParams): boolean {
  return Object.keys(a)
    .filter((key) => key !== 'correctDrift')
    .every(
      (key) =>
        a[key as keyof SimulationParams] === b[key as keyof SimulationParams],
    );
}
