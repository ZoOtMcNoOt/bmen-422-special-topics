'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { DIFFRACTION_LIMIT_NM, FWHM_PER_SIGMA } from '@/lib/simulator/defaults';
import type { SimulationResult } from '@/lib/simulator/types';

type Props = {
  result: SimulationResult | null;
  isRunning: boolean;
  framesCompleted: number;
  nFrames: number;
  nLocalized: number;
  /** Live params or sample differ from what the result was acquired with. */
  isStale: boolean;
  onClear: () => void;
};

/** Below this fraction of blinks detected, warn that molecules are overlapping. */
const OVERLAP_WARN_EFFICIENCY = 0.6;
/** Show one decimal for precisions under this many nm. */
const ONE_DECIMAL_BELOW_NM = 10;

/** The one-line answer: how much sharper did STORM get than the diffraction limit? */
export function ResultSummary({ result, isRunning, framesCompleted, nFrames, nLocalized, isStale, onClear }: Props) {
  if (isRunning) {
    const pct = Math.round((framesCompleted / nFrames) * 100);
    return (
      <Strip>
        <div className="flex flex-1 flex-col gap-1.5">
          <p className="text-sm text-foreground">
            Acquiring frame <Mono>{framesCompleted.toLocaleString()}</Mono> of <Mono>{nFrames.toLocaleString()}</Mono>
            {' · '}
            <Mono>{nLocalized.toLocaleString()}</Mono> molecules localized
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-storm" animate={{ width: `${pct}%` }} transition={{ ease: 'linear', duration: 0.15 }} />
          </div>
        </div>
      </Strip>
    );
  }

  if (!result) {
    return (
      <Strip>
        <p className="text-sm text-muted-foreground">
          A light microscope blurs anything closer than ~{DIFFRACTION_LIMIT_NM} nm into one blob. Press{' '}
          <b className="text-foreground">Run</b> to localize one blinking molecule at a time and watch the structure emerge.
        </p>
      </Strip>
    );
  }

  const limitNm = FWHM_PER_SIGMA * result.params.psfSigmaNm;
  const achievedNm = result.empiricalPrecisionNm;
  const gain = achievedNm > 0 ? limitNm / achievedNm : 0;
  const partial = result.framesCompleted < result.params.nFrames;
  const eta = result.detectionEfficiency;

  return (
    <Strip>
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <span className="text-muted-foreground">{Math.round(limitNm)} nm</span>
          <span className="mx-2 text-muted-foreground">→</span>
          <span className="text-storm">{achievedNm.toFixed(achievedNm < ONE_DECIMAL_BELOW_NM ? 1 : 0)} nm</span>
        </p>
        <p className="text-sm text-foreground">
          <b>{gain.toFixed(gain >= ONE_DECIMAL_BELOW_NM ? 0 : 1)}×</b> sharper than the diffraction limit
        </p>
        <span className="text-xs text-muted-foreground">
          {result.localizations.length.toLocaleString()} molecules · median distance to true position
        </span>
      </motion.div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {eta < OVERLAP_WARN_EFFICIENCY && (
          <Badge tone="warn">Molecules overlapping — {Math.round(eta * 100)}% of blinks caught</Badge>
        )}
        {partial && <Badge tone="muted">Stopped at {result.framesCompleted.toLocaleString()} frames</Badge>}
        {isStale && <Badge tone="warn">Settings changed — run again to update</Badge>}
        <button type="button" onClick={onClear} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Clear
        </button>
      </div>
    </Strip>
  );
}

function Strip({ children }: { children: ReactNode }) {
  return (
    <section aria-live="polite" className="flex min-h-14 flex-col gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </section>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono tabular-nums">{children}</span>;
}

function Badge({ tone, children }: { tone: 'warn' | 'muted'; children: ReactNode }) {
  const cls = tone === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-border bg-muted text-muted-foreground';
  return <span className={`rounded-full border px-2 py-0.5 ${cls}`}>{children}</span>;
}
