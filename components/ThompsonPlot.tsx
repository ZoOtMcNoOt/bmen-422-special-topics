'use client';

import { useEffect, useRef } from 'react';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';

export type ThompsonPlotProps = {
  psfSigmaNm: number;
  pixelSizeNm: number;
  backgroundPerPixel: number;
  currentPhotons: number;
  measuredSigmaLocNm: number | null;
};

export function ThompsonPlot({
  psfSigmaNm,
  pixelSizeNm,
  backgroundPerPixel,
  currentPhotons,
  measuredSigmaLocNm,
}: ThompsonPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Axes: log N from 100 to 10000, log σ from 0.5 to 50
    const xMin = Math.log10(100);
    const xMax = Math.log10(10000);
    const yMin = Math.log10(0.5);
    const yMax = Math.log10(50);

    const padding = { left: 50, right: 10, top: 10, bottom: 30 };
    const plotW = W - padding.left - padding.right;
    const plotH = H - padding.top - padding.bottom;

    const toPx = (logN: number, logSigma: number): [number, number] => {
      const x = padding.left + ((logN - xMin) / (xMax - xMin)) * plotW;
      const y = padding.top + plotH - ((logSigma - yMin) / (yMax - yMin)) * plotH;
      return [x, y];
    };

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let n = 2; n <= 4; n++) {
      const [x0] = toPx(n, yMin);
      const [x1] = toPx(n, yMax);
      ctx.beginPath();
      ctx.moveTo(x0, padding.top);
      ctx.lineTo(x1, padding.top + plotH);
      ctx.stroke();
    }
    for (let s = 0; s <= 2; s++) {
      const [, y0] = toPx(xMin, s);
      ctx.beginPath();
      ctx.moveTo(padding.left, y0);
      ctx.lineTo(padding.left + plotW, y0);
      ctx.stroke();
    }

    // Thompson curve
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    for (let lx = xMin; lx <= xMax; lx += 0.02) {
      const n = Math.pow(10, lx);
      const s = thompsonSigmaLoc(psfSigmaNm, n, pixelSizeNm, backgroundPerPixel);
      const [px, py] = toPx(lx, Math.log10(s));
      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // Current prediction point
    const currentPred = thompsonSigmaLoc(psfSigmaNm, currentPhotons, pixelSizeNm, backgroundPerPixel);
    const [cpx, cpy] = toPx(Math.log10(currentPhotons), Math.log10(currentPred));
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(cpx, cpy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Measured point
    if (measuredSigmaLocNm !== null && measuredSigmaLocNm > 0) {
      const [mpx, mpy] = toPx(Math.log10(currentPhotons), Math.log10(measuredSigmaLocNm));
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(mpx, mpy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px monospace';
    ctx.fillText('σ_loc (nm)', 5, 15);
    ctx.fillText('photons (N)', W - 80, H - 10);
  }, [psfSigmaNm, pixelSizeNm, backgroundPerPixel, currentPhotons, measuredSigmaLocNm]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-sm font-medium text-slate-300">Thompson verification</div>
      <canvas ref={canvasRef} width={360} height={240} />
      <div className="flex justify-between text-xs text-slate-400">
        <span>
          Predicted:{' '}
          <span className="text-orange-400 font-mono">
            {thompsonSigmaLoc(psfSigmaNm, currentPhotons, pixelSizeNm, backgroundPerPixel).toFixed(2)} nm
          </span>
        </span>
        <span>
          Measured:{' '}
          <span className="text-cyan-400 font-mono">
            {measuredSigmaLocNm !== null ? measuredSigmaLocNm.toFixed(2) : '—'} nm
          </span>
        </span>
      </div>
    </div>
  );
}
