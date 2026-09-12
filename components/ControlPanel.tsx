'use client';

import { useId } from 'react';

import type { SimulationParams } from '@/lib/simulator/types';
import { EMITTER_STEP, MIN_EMITTERS, MAX_EMITTERS } from '@/lib/presets';

type Props = {
  params: SimulationParams;

  onChange: (params: SimulationParams) => void;

  moleculeCount: number;

  onMoleculeCountChange: (count: number) => void;
  seed: number;
  onSeedChange: (seed: number) => void;

  disabled: boolean;
};

export function ControlPanel({
  params,
  onChange,
  moleculeCount,
  onMoleculeCountChange,
  seed,
  onSeedChange,
  disabled,
}: Props) {
  const set = <K extends keyof SimulationParams>(
    key: K,
    value: SimulationParams[K],
  ) => onChange({ ...params, [key]: value });

  return (
    <fieldset disabled={disabled} className="acquisition-controls">
      <Range
        label="Photon yield"
        value={params.photonsPerCycle}
        output={params.photonsPerCycle.toLocaleString()}
        min={200}
        max={10000}
        step={100}
        unit="photons / active frame"
        onChange={(value) => set('photonsPerCycle', value)}
      />

      <Range
        label="Labelled molecules"
        value={moleculeCount}
        output={moleculeCount.toLocaleString()}
        min={MIN_EMITTERS}
        max={MAX_EMITTERS}
        step={EMITTER_STEP}
        unit="in the sample"
        onChange={onMoleculeCountChange}
      />

      <Range
        label="Activation"
        value={Math.log10(params.dutyCycle)}
        output={`${(100 * params.dutyCycle).toFixed(2)}%`}
        min={-4}
        max={-2}
        step={0.1}
        lower="Sparse"
        upper="Dense"
        unit={`${(moleculeCount * params.dutyCycle).toLocaleString(undefined, { maximumFractionDigits: 2 })} on / frame on average`}
        onChange={(value) => set('dutyCycle', 10 ** value)}
      />

      <details className="advanced-settings">
        <summary>
          More settings <span aria-hidden="true">+</span>
        </summary>

        <div className="advanced-controls">
          <Range
            label="Frames recorded"
            value={params.nFrames}
            output={params.nFrames.toLocaleString()}
            min={200}
            max={10000}
            step={100}
            unit="camera frames"
            onChange={(value) => set('nFrames', value)}
          />

          <Range
            label="Background"
            value={params.backgroundPerPixel}
            output={String(params.backgroundPerPixel)}
            min={0}
            max={100}
            step={1}
            unit="photons / pixel"
            onChange={(value) => set('backgroundPerPixel', value)}
          />

          <Range
            label="Stage drift"
            value={params.driftRateNmPerFrame}
            output={params.driftRateNmPerFrame.toFixed(1)}
            min={0}
            max={5}
            step={0.1}
            unit="nm / frame in x"
            onChange={(value) => set('driftRateNmPerFrame', value)}
          />

          <label className="select-control">
            Fitting method
            <select
              value={params.rigorMode}
              onChange={(event) =>
                set(
                  'rigorMode',
                  event.target.value === 'pedagogical'
                    ? 'pedagogical'
                    : 'rigorous',
                )
              }
            >
              <option value="rigorous">Poisson fit</option>
              <option value="pedagogical">Centroid</option>
            </select>
          </label>
          <label className="select-control">
            Random seed
            <input
              type="number"
              min={0}
              max={2 ** 32 - 1}
              step={1}
              value={seed}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isInteger(value) && value >= 0 && value < 2 ** 32)
                  onSeedChange(value);
              }}
            />
          </label>
        </div>
      </details>
    </fieldset>
  );
}

function Range({
  label,
  value,
  output,
  min,
  max,
  step,
  unit,
  lower,
  upper,
  onChange,
}: {
  label: string;
  value: number;
  output: string;
  min: number;
  max: number;
  step: number;

  unit: string;
  lower?: string;
  upper?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();

  return (
    <div className="range-control">
      <div className="control-label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{output}</output>
      </div>

      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${output}, ${unit}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />

      <div className="range-labels">
        <span>{lower ?? min.toLocaleString()}</span>
        <span>{unit}</span>
        <span>{upper ?? max.toLocaleString()}</span>
      </div>
    </div>
  );
}
