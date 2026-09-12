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
  DEFAULT_PRESET,
  PRESETS,
  viewBoxFor,
  type PresetKind,
} from '@/lib/presets';
import { decodeState, encodeState } from '@/lib/url-state';
import { downloadBlob, localizationCsv } from '@/lib/export';
import { DEFAULT_SEED, seededRandom } from '@/lib/simulator/random';
import type { DecodedImage } from '@/lib/rendering/canvas';
import type {
  GroundTruth,
  GroundTruthInput,
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
  input: GroundTruthInput;
  seed: number;
};

export default function Page() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [preset, setPreset] = useState<PresetKind>(DEFAULT_PRESET);
  const [moleculeCount, setMoleculeCount] = useState(PRESETS[DEFAULT_PRESET].defaultEmitters);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [decodingImage, setDecodingImage] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [displaySample, setDisplaySample] = useState<DisplaySample | null>(
    null,
  );
  const [running, setRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const initialRunStarted = useRef(false);
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
      setMoleculeCount(s.moleculeCount);
      setSeed(s.seed);
    }
    restored.current = true;
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    const timer = setTimeout(
      () =>
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}?${encodeState({ params, preset, moleculeCount, seed })}`,
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [params, preset, moleculeCount, seed]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const specimenInput = useMemo(
    () => PRESETS[preset].build(moleculeCount, image),
    [preset, moleculeCount, image],
  );
  const groundTruth = useMemo(() => {
    if (!specimenInput) return null;
    try {
      return generateGroundTruth(specimenInput, {
        width: FIELD_SIZE_NM,
        height: FIELD_SIZE_NM,
      }, seededRandom(seed));
    } catch {
      return null;
    }
  }, [specimenInput, seed]);
  const draftView = useMemo(
    () => viewBoxFor(preset),
    [preset],
  );
  const view = displaySample?.view ?? draftView;

  const start = useCallback(async () => {
    if (!groundTruth || !specimenInput || running || decodingImage) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDisplaySample({ truth: groundTruth, view: draftView, preset, params, input: specimenInput, seed });
    setRunning(true);
    setResult(null);
    setError(null);
    setLive(null);
    setRunId((n) => n + 1);
    try {
      setResult(
        await runSimulation(groundTruth, params, {
          // Keep image labelling and acquisition noise in independent repeatable streams.
          rng: seededRandom(seed ^ 0xa5a5a5a5),
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
  }, [groundTruth, specimenInput, params, preset, draftView, seed, running, decodingImage]);

  useEffect(() => {
    if (!hydrated || !groundTruth || running || decodingImage || initialRunStarted.current) return;
    initialRunStarted.current = true;
    void start();
  }, [hydrated, groundTruth, start, runId, running, decodingImage]);

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?${encodeState({ params, preset, moleculeCount, seed })}`;
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
  const resetObservation = () => {
    initialRunStarted.current = false;
    setDisplaySample(null);
    setResult(null);
    setLive(null);
    setError(null);
    setRunId((id) => id + 1);
  };
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
                  new Blob([localizationCsv(result, displaySample?.seed)], {
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
                  resetObservation();
                  setParams({ ...DEFAULT_PARAMS });
                  setMoleculeCount(PRESETS[DEFAULT_PRESET].defaultEmitters);
                  setSeed(DEFAULT_SEED);
                  setPreset(DEFAULT_PRESET);
                }}
              >
                <RotateCcw />
              </Button>
            </div>
            <PresetPicker
              value={preset}
              onChange={(next) => {
                resetObservation();
                setPreset(next);
                setMoleculeCount(PRESETS[next].defaultEmitters);
              }}
              onImageLoaded={(nextImage) => {
                resetObservation();
                setImage(nextImage);
              }}
              decodingImage={decodingImage}
              onDecodingChange={setDecodingImage}
              disabled={running}
            />
            <ControlPanel
              params={params}
              onChange={setParams}
              moleculeCount={moleculeCount}
              onMoleculeCountChange={setMoleculeCount}
              seed={seed}
              onSeedChange={setSeed}
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
                  disabled={!groundTruth || decodingImage}
                  className="run-button"
                >
                  <Play className="size-3 fill-current" />
                  Run experiment
                </Button>
              )}
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                {decodingImage
                  ? 'Reading image…'
                  : needsImage
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
              specimen={displaySample?.input ?? specimenInput}
              seed={displaySample?.seed ?? seed}
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
            single-emitter fit screens spot brightness and shape against this
            model. It assumes the configured mean brightness is the same for
            every molecule. Rejected spots reduce detection recall; dim or
            overlapping molecules can still give biased fits.
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
          fixed scale for the acquisition. The camera&apos;s all-frame mean averages
          the raw acquired frames and is normalized separately. Both retain
          stage drift.
        </p>
        <p className="mb-5 text-xs text-muted-foreground">
          The conventional view sums the same Gaussian PSF over every emitter,
          with all emitters on. It shows the ideal fluorescence image before
          camera sampling, without noise, background, or drift. Its brightness is
          normalized independently. All four views show the same physical crop;
          colors indicate intensity or position, not emission wavelength.
        </p>
        <p className="mb-5 text-xs text-muted-foreground">
          The actual object is the known geometry or uploaded image. Molecules
          shows its labels; the reconstruction contains only accepted camera
          fits. Labels may blink repeatedly or remain unseen during a finite
          acquisition. The same seed, settings, and source image reproduce the
          same run. Shared links do not include uploaded images.
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
