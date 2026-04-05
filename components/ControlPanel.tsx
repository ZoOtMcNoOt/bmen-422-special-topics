'use client';

import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { SimulationParams } from '@/lib/simulator/types';

export type ControlPanelProps = {
  params: SimulationParams;
  onChange: (params: SimulationParams) => void;
};

// Base UI's Slider (used by the `base-nova` shadcn style) types `onValueChange`'s
// argument as `number | readonly number[]` because the primitive supports both
// single-thumb (scalar) and range (array) modes. All sliders here are single-thumb,
// so we narrow to the scalar at the callback boundary.
const asNumber = (v: number | readonly number[]): number =>
  (Array.isArray(v) ? v[0] : v) as number;

export function ControlPanel({ params, onChange }: ControlPanelProps) {
  const update = (key: keyof SimulationParams, value: number | boolean | string) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-slate-800 bg-slate-900/50 p-6">
      <div className="text-lg font-semibold">Simulation parameters</div>

      <div className="space-y-2">
        <Label>
          Photons per molecule: <span className="font-mono">{params.photonsPerCycle}</span>
        </Label>
        <Slider
          min={100}
          max={10000}
          step={100}
          value={[params.photonsPerCycle]}
          onValueChange={(v) => update('photonsPerCycle', asNumber(v))}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Background: <span className="font-mono">{params.backgroundPerPixel} photons/px</span>
        </Label>
        <Slider
          min={0}
          max={50}
          step={1}
          value={[params.backgroundPerPixel]}
          onValueChange={(v) => update('backgroundPerPixel', asNumber(v))}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Frames: <span className="font-mono">{params.nFrames}</span>
        </Label>
        <Slider
          min={100}
          max={20000}
          step={100}
          value={[params.nFrames]}
          onValueChange={(v) => update('nFrames', asNumber(v))}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Duty cycle: <span className="font-mono">{params.dutyCycle.toExponential(1)}</span>
        </Label>
        <Slider
          min={-5}
          max={-2}
          step={0.1}
          value={[Math.log10(params.dutyCycle)]}
          onValueChange={(v) => update('dutyCycle', Math.pow(10, asNumber(v)))}
        />
      </div>

      <div className="space-y-2">
        <Label>
          Drift rate: <span className="font-mono">{params.driftRateNmPerFrame.toFixed(2)} nm/frame</span>
        </Label>
        <Slider
          min={0}
          max={5}
          step={0.1}
          value={[params.driftRateNmPerFrame]}
          onValueChange={(v) => update('driftRateNmPerFrame', asNumber(v))}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="correctDrift"
          type="checkbox"
          checked={params.correctDrift}
          onChange={(e) => update('correctDrift', e.target.checked)}
          className="h-4 w-4"
        />
        <Label htmlFor="correctDrift">Apply drift correction</Label>
      </div>

      <div className="space-y-2">
        <Label>Math rigor</Label>
        <RadioGroup
          value={params.rigorMode}
          onValueChange={(v) => update('rigorMode', v)}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="pedagogical" id="r-ped" />
            <Label htmlFor="r-ped">Pedagogical (centroid, point-sampled PSF)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="rigorous" id="r-rig" />
            <Label htmlFor="r-rig">Rigorous (MLE, pixel-integrated PSF)</Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}
