'use client';

import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { DEFAULT_PARAMS, MAX_PHOTONS_PER_CYCLE } from '@/lib/simulator/defaults';
import { DEFAULT_DENSITY_PER_UM2 } from '@/lib/presets';
import { sliderValue } from '@/lib/utils';
import type { SimulationParams } from '@/lib/simulator/types';
import { Collapsible } from './Collapsible';

/** Blinking sparsity slider works in log10(duty cycle). */
const LOG_DUTY_MIN = -4;
const LOG_DUTY_MAX = -2;

type Props = {
  params: SimulationParams;
  onChange: (params: SimulationParams) => void;
  densityPerUm2: number;
  onDensityChange: (d: number) => void;
  disabled: boolean;
};

/** Drift rate applied when the user switches drift on. */
const DEFAULT_DRIFT_NM_PER_FRAME = 1;

type DriftMode = 'off' | 'corrected' | 'uncorrected';
const isDriftMode = (v: unknown): v is DriftMode => v === 'off' || v === 'corrected' || v === 'uncorrected';

export function ControlPanel({ params, onChange, densityPerUm2, onDensityChange, disabled }: Props) {
  const set = <K extends keyof SimulationParams>(key: K, value: SimulationParams[K]) =>
    onChange({ ...params, [key]: value });

  const driftMode: DriftMode =
    params.driftRateNmPerFrame === 0 ? 'off' : params.correctDrift ? 'corrected' : 'uncorrected';
  const setDriftMode = (m: DriftMode) =>
    onChange({
      ...params,
      driftRateNmPerFrame: m === 'off' ? 0 : params.driftRateNmPerFrame || DEFAULT_DRIFT_NM_PER_FRAME,
      correctDrift: m !== 'uncorrected',
    });

  const isDefault =
    params.photonsPerCycle === DEFAULT_PARAMS.photonsPerCycle &&
    params.backgroundPerPixel === DEFAULT_PARAMS.backgroundPerPixel &&
    params.nFrames === DEFAULT_PARAMS.nFrames &&
    params.dutyCycle === DEFAULT_PARAMS.dutyCycle &&
    params.driftRateNmPerFrame === DEFAULT_PARAMS.driftRateNmPerFrame &&
    params.correctDrift === DEFAULT_PARAMS.correctDrift &&
    params.rigorMode === DEFAULT_PARAMS.rigorMode &&
    densityPerUm2 === DEFAULT_DENSITY_PER_UM2;

  // <fieldset disabled> covers native inputs; Base UI sliders and radios need it explicitly.
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-6 disabled:opacity-60">
      <Control
        label="Molecule brightness"
        value={`${params.photonsPerCycle.toLocaleString()} photons per blink`}
        help="Brighter blinks are pinned down more precisely — four times the photons halves the error."
      >
        <Slider disabled={disabled} min={200} max={MAX_PHOTONS_PER_CYCLE} step={100} value={[params.photonsPerCycle]} onValueChange={(v) => set('photonsPerCycle', sliderValue(v))} />
      </Control>

      <Control
        label="Frames recorded"
        value={`${params.nFrames.toLocaleString()} camera frames`}
        help="More frames catch more blinks and fill in the structure."
      >
        <Slider disabled={disabled} min={200} max={10_000} step={100} value={[params.nFrames]} onValueChange={(v) => set('nFrames', sliderValue(v))} />
      </Control>

      <Control
        label="Background glow"
        value={`${params.backgroundPerPixel} photons per pixel`}
        help="Stray light in every pixel. It hides dim blinks and widens the error on bright ones."
      >
        <Slider disabled={disabled} min={0} max={100} step={1} value={[params.backgroundPerPixel]} onValueChange={(v) => set('backgroundPerPixel', sliderValue(v))} />
      </Control>

      <Collapsible title="Advanced" as="h3">
        <div className="flex flex-col gap-6 pt-2">
          <Control
            label="Blinking sparsity"
            value={`1 in ${Math.round(1 / params.dutyCycle).toLocaleString()} molecules lit at once`}
            help="STORM only works when nearly everything is dark. Turn this up to see molecules overlap and merge."
          >
            <Slider disabled={disabled} min={LOG_DUTY_MIN} max={LOG_DUTY_MAX} step={0.1} value={[Math.log10(params.dutyCycle)]} onValueChange={(v) => set('dutyCycle', 10 ** sliderValue(v))} />
          </Control>

          <Control
            label="Labelling density"
            value={`${densityPerUm2} molecules per µm²`}
            help="How densely the sample is tagged. Sparse labelling leaves gaps; dense labelling causes overlaps."
          >
            <Slider disabled={disabled} min={25} max={500} step={25} value={[densityPerUm2]} onValueChange={(v) => onDensityChange(sliderValue(v))} />
          </Control>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-foreground">Stage drift</Label>
            <p className="text-xs leading-snug text-muted-foreground">
              Real samples creep by a few nm per frame. Correction re-aligns the frames before rebuilding.
            </p>
            <RadioGroup disabled={disabled} value={driftMode} onValueChange={(v) => isDriftMode(v) && setDriftMode(v)} className="flex flex-col gap-1.5">
              <Option id="drift-off" value="off" label="None" />
              <Option id="drift-corr" value="corrected" label="Drifting, corrected" />
              <Option id="drift-raw" value="uncorrected" label="Drifting, uncorrected" />
            </RadioGroup>
            {driftMode !== 'off' && (
              <Control label="Drift rate" value={`${params.driftRateNmPerFrame.toFixed(1)} nm per frame`}>
                <Slider disabled={disabled} min={0.2} max={5} step={0.1} value={[params.driftRateNmPerFrame]} onValueChange={(v) => set('driftRateNmPerFrame', sliderValue(v))} />
              </Control>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-foreground">Fitting method</Label>
            <p className="text-xs leading-snug text-muted-foreground">How each blink is turned into a position.</p>
            <RadioGroup disabled={disabled} value={params.rigorMode} onValueChange={(v) => set('rigorMode', v === 'pedagogical' ? 'pedagogical' : 'rigorous')} className="flex flex-col gap-1.5">
              <Option id="fit-simple" value="pedagogical" label="Simple — centre of mass of the blob" />
              <Option id="fit-mle" value="rigorous" label="Realistic — fits the blur shape, as real software does" />
            </RadioGroup>
          </div>
        </div>
      </Collapsible>

      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || isDefault}
        onClick={() => {
          onChange({ ...DEFAULT_PARAMS });
          onDensityChange(DEFAULT_DENSITY_PER_UM2);
        }}
        className="self-start"
      >
        <RotateCcw data-icon="inline-start" />
        Restore defaults
      </Button>
    </fieldset>
  );
}

function Control({ label, value, help, children }: { label: string; value: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{value}</span>
      </div>
      {children}
      {help && <p className="text-xs leading-snug text-muted-foreground">{help}</p>}
    </div>
  );
}

function Option({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="text-sm font-normal text-foreground">{label}</Label>
    </div>
  );
}
