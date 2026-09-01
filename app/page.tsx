'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Link2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible } from '@/components/Collapsible';
import { ControlPanel } from '@/components/ControlPanel';
import { ImagePanel } from '@/components/ImagePanel';
import { PresetPicker } from '@/components/PresetPicker';
import { ReconstructionPanel } from '@/components/ReconstructionPanel';
import { ResultSummary } from '@/components/ResultSummary';
import { ThompsonPlot } from '@/components/ThompsonPlot';
import { usePreviewWorker } from '@/lib/rendering/usePreviewWorker';
import { DEFAULT_PARAMS, FIELD_SIZE_NM, FWHM_PER_SIGMA, RENDER_PX } from '@/lib/simulator/defaults';
import { generateGroundTruth } from '@/lib/simulator/groundTruth';
import { runSimulation, type LiveUpdate } from '@/lib/simulator/runSimulation';
import { DEFAULT_DENSITY_PER_UM2, DEFAULT_PRESET, PRESETS, emitterCount, viewBoxFor, type PresetKind } from '@/lib/presets';
import { decodeState, encodeState } from '@/lib/url-state';
import { cn } from '@/lib/utils';
import type { SimulationParams, SimulationResult } from '@/lib/simulator/types';

type Panel = 'truth' | 'microscope' | 'storm';
const isPanel = (v: unknown): v is Panel => v === 'truth' || v === 'microscope' || v === 'storm';

const URL_SYNC_DEBOUNCE_MS = 300;
const COPIED_RESET_MS = 1800;
const NO_LIVE: LiveUpdate = { localizations: [], framesCompleted: 0 };
const RUN_BUTTON_CLASS = 'h-11 flex-1 lg:flex-none lg:px-6';

export default function Page() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [preset, setPreset] = useState<PresetKind>(DEFAULT_PRESET);
  const [densityPerUm2, setDensity] = useState(DEFAULT_DENSITY_PER_UM2);
  const [image, setImage] = useState<ImageData | null>(null);

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveUpdate>(NO_LIVE);
  /** Increments per run so the reconstruction panel remounts with fresh scrub state. */
  const [runId, setRunId] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const [mobilePanel, setMobilePanel] = useState<Panel>('storm');
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);

  // Restore shared state once, then mirror state into the address bar.
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
    const t = setTimeout(() => {
      window.history.replaceState(null, '', `${window.location.pathname}?${encodeState({ params, preset, densityPerUm2 })}`);
    }, URL_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [params, preset, densityPerUm2]);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  const groundTruth = useMemo(() => {
    const input = PRESETS[preset].build(emitterCount(densityPerUm2), image);
    if (!input) return null;
    try {
      return generateGroundTruth(input, { width: FIELD_SIZE_NM, height: FIELD_SIZE_NM });
    } catch {
      return null; // e.g. an all-black image — PhotoUpload has already told the user
    }
  }, [preset, densityPerUm2, image]);

  const view = useMemo(() => viewBoxFor(preset, groundTruth?.emitters), [preset, groundTruth]);
  const preview = usePreviewWorker(groundTruth, view, RENDER_PX, params.psfSigmaNm);

  const start = useCallback(async () => {
    if (!groundTruth || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResult(null);
    setLive(NO_LIVE);
    setRunId((n) => n + 1);
    setMobilePanel('storm');
    try {
      setResult(await runSimulation(groundTruth, params, { onUpdate: setLive, signal: controller.signal }));
    } catch (err) {
      console.error('Acquisition failed', err);
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, [groundTruth, params, running]);

  const stop = () => abortRef.current?.abort();
  const clear = () => {
    setResult(null);
    setLive(NO_LIVE);
    setRunId((n) => n + 1);
  };

  const copyLink = async () => {
    // Build from state rather than reading the (debounced) address bar.
    const url = `${window.location.origin}${window.location.pathname}?${encodeState({ params, preset, densityPerUm2 })}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied('idle'), COPIED_RESET_MS);
  };

  const shownLocs = result?.localizations ?? live.localizations;
  const framesCompleted = result?.framesCompleted ?? live.framesCompleted;
  const isStale =
    result !== null && (result.groundTruth !== groundTruth || !sameAcquisition(result.params, params));
  const needsImage = preset === 'image' && !groundTruth;
  const previewEmptyText = needsImage ? 'Upload an image below' : 'Rendering…';

  const captions = {
    truth: 'Where every molecule actually is.',
    microscope: `One long exposure. Anything closer than ~${Math.round(FWHM_PER_SIGMA * params.psfSigmaNm)} nm blurs together.`,
    storm: running
      ? 'Localizing one blinking molecule at a time…'
      : result
      ? 'Each dot is one blink, placed to within a few nanometres.'
      : 'Blinks are localized one at a time and stacked.',
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-screen-2xl flex-col gap-5 px-4 pt-5 pb-28 sm:px-6 lg:pb-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">See past the blur</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            How STORM microscopy resolves structures a light microscope can&apos;t — one blinking molecule at a time.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0">
          {copied === 'ok' ? <Check data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
          {copied === 'ok' ? 'Link copied' : copied === 'fail' ? 'Copy the address bar' : 'Copy link'}
        </Button>
      </header>

      <ResultSummary
        result={result}
        isRunning={running}
        framesCompleted={framesCompleted}
        nFrames={params.nFrames}
        nLocalized={shownLocs.length}
        isStale={isStale}
        onClear={clear}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          <Tabs value={mobilePanel} onValueChange={(v) => isPanel(v) && setMobilePanel(v)} className="md:hidden">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="truth">1 · Truth</TabsTrigger>
              <TabsTrigger value="microscope">2 · Microscope</TabsTrigger>
              <TabsTrigger value="storm">3 · STORM</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 md:grid-cols-3">
            <ImagePanel
              step={1}
              title="What's actually there"
              caption={captions.truth}
              pixels={preview.groundTruth}
              view={view}
              emptyText={previewEmptyText}
              className={cn(mobilePanel !== 'truth' && 'hidden md:flex')}
            />
            <ImagePanel
              step={2}
              title="What the microscope sees"
              caption={captions.microscope}
              pixels={preview.diffractionLimited}
              view={view}
              emptyText={previewEmptyText}
              className={cn(mobilePanel !== 'microscope' && 'hidden md:flex')}
            />
            <ReconstructionPanel
              key={runId}
              step={3}
              title="What STORM recovers"
              caption={captions.storm}
              localizations={shownLocs}
              view={view}
              framesCompleted={framesCompleted}
              isRunning={running}
              className={cn(mobilePanel !== 'storm' && 'hidden md:flex', isStale && 'opacity-60')}
            />
          </div>
          <p className="-mt-2 text-center text-xs text-muted-foreground">
            Same sample, same field of view, same scale. Only the method changes.
          </p>

          {/* Primary action — fixed to the thumb zone on phones, inline on desktop. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-screen-2xl items-center gap-3 lg:mx-0 lg:max-w-none">
              {running ? (
                <Button variant="outline" onClick={stop} className={RUN_BUTTON_CLASS}>
                  <Square data-icon="inline-start" className="fill-current" />
                  Stop
                </Button>
              ) : (
                <Button onClick={start} disabled={!groundTruth} className={RUN_BUTTON_CLASS}>
                  {result ? 'Run again' : `Run · ${params.nFrames.toLocaleString()} frames`}
                </Button>
              )}
              {needsImage && !running && <span className="text-sm text-muted-foreground">Upload an image to run.</span>}
            </div>
          </div>

          <PresetPicker value={preset} onChange={setPreset} onImageLoaded={setImage} disabled={running} />

          <Collapsible title="See the physics">
            <ThompsonPlot params={params} result={result} />
          </Collapsible>
        </div>

        <aside>
          <Collapsible title="Adjust the experiment" alwaysOpenOnDesktop>
            <ControlPanel params={params} onChange={setParams} densityPerUm2={densityPerUm2} onDensityChange={setDensity} disabled={running} />
          </Collapsible>
        </aside>
      </div>
    </main>
  );
}

/** Params that change the acquisition itself (not display-only ones). */
function sameAcquisition(a: SimulationParams, b: SimulationParams): boolean {
  return (
    a.photonsPerCycle === b.photonsPerCycle &&
    a.backgroundPerPixel === b.backgroundPerPixel &&
    a.dutyCycle === b.dutyCycle &&
    a.nFrames === b.nFrames &&
    a.driftRateNmPerFrame === b.driftRateNmPerFrame &&
    a.correctDrift === b.correctDrift &&
    a.rigorMode === b.rigorMode
  );
}
