'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';

// Register the subset of ECharts we actually use. This keeps the bundle
// size bounded (~180 kB vs ~900 kB for the full build).
echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export type ThompsonPlotProps = {
  psfSigmaNm: number;
  pixelSizeNm: number;
  backgroundPerPixel: number;
  currentPhotons: number;
  measuredSigmaLocNm: number | null;
};

const N_MIN = 100;
const N_MAX = 10000;
const CURVE_STEPS = 120;

export function ThompsonPlot({
  psfSigmaNm,
  pixelSizeNm,
  backgroundPerPixel,
  currentPhotons,
  measuredSigmaLocNm,
}: ThompsonPlotProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);

  // Precompute Thompson curve + shot-noise asymptote at log-spaced N values.
  const curves = useMemo(() => {
    const logMin = Math.log10(N_MIN);
    const logMax = Math.log10(N_MAX);
    const thompson: [number, number][] = [];
    const shot: [number, number][] = [];
    for (let i = 0; i <= CURVE_STEPS; i++) {
      const lx = logMin + ((logMax - logMin) * i) / CURVE_STEPS;
      const N = Math.pow(10, lx);
      thompson.push([N, thompsonSigmaLoc(psfSigmaNm, N, pixelSizeNm, backgroundPerPixel)]);
      shot.push([N, psfSigmaNm / Math.sqrt(N)]);
    }
    return { thompson, shot };
  }, [psfSigmaNm, pixelSizeNm, backgroundPerPixel]);

  const currentPred = useMemo(
    () => thompsonSigmaLoc(psfSigmaNm, currentPhotons, pixelSizeNm, backgroundPerPixel),
    [psfSigmaNm, currentPhotons, pixelSizeNm, backgroundPerPixel]
  );

  // Init + dispose lifecycle. Re-running `setOption` on prop changes happens
  // in the other effect below.
  useEffect(() => {
    if (!divRef.current) return;
    const chart = echarts.init(divRef.current, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    // Resize when the container itself changes (e.g. parent column reflows)
    const ro = new ResizeObserver(onResize);
    ro.observe(divRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const hasMeasured = measuredSigmaLocNm !== null && measuredSigmaLocNm > 0;
    const ratio = hasMeasured ? (measuredSigmaLocNm as number) / currentPred : null;

    chart.setOption({
      // `notMerge` so the Measured series disappears cleanly on reset rather
      // than lingering with stale data.
      animation: true,
      animationDuration: 250,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'ui-monospace, monospace' },
      grid: { left: 58, right: 14, top: 30, bottom: 44 },
      legend: {
        top: 2,
        right: 8,
        textStyle: { color: '#cbd5e1', fontSize: 11 },
        itemWidth: 18,
        itemHeight: 10,
        icon: 'roundRect',
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        axisPointer: {
          type: 'cross',
          snap: true,
          label: {
            backgroundColor: '#1e293b',
            color: '#e2e8f0',
            fontSize: 10,
            formatter: (p: { axisDimension: string; value: number }) =>
              p.axisDimension === 'x'
                ? `N = ${Math.round(p.value).toLocaleString()}`
                : `σ = ${p.value.toFixed(2)} nm`,
          },
        },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          if (arr.length === 0) return '';
          const first = arr[0] as { data: [number, number] };
          const n = first.data[0];
          const rows = arr
            .map((s) => {
              const p = s as { seriesName: string; color: string; data: [number, number] };
              return `<span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:50%;margin-right:6px"></span>${p.seriesName}: <b>${p.data[1].toFixed(2)} nm</b>`;
            })
            .join('<br/>');
          return `<div style="font-family:ui-monospace,monospace;font-size:12px"><b>N = ${Math.round(n).toLocaleString()}</b><br/>${rows}</div>`;
        },
      },
      xAxis: {
        type: 'log',
        logBase: 10,
        min: N_MIN,
        max: N_MAX,
        name: 'Photons per molecule (N)',
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 500 },
        axisLine: { lineStyle: { color: '#475569' } },
        axisTick: { lineStyle: { color: '#475569' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)),
        },
        splitLine: { show: true, lineStyle: { color: '#1e293b' } },
        minorTick: { show: true, splitNumber: 5, lineStyle: { color: '#334155' } },
        minorSplitLine: { show: true, lineStyle: { color: '#0f172a' } },
      },
      yAxis: {
        type: 'log',
        logBase: 10,
        min: 0.5,
        max: 50,
        name: 'σ_loc  (nm)',
        nameLocation: 'middle',
        nameGap: 40,
        nameRotate: 90,
        nameTextStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 500 },
        axisLine: { lineStyle: { color: '#475569' } },
        axisTick: { lineStyle: { color: '#475569' } },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          formatter: (v: number) => (v < 1 ? v.toFixed(1) : String(v)),
        },
        splitLine: { show: true, lineStyle: { color: '#1e293b' } },
        minorTick: { show: true, splitNumber: 5, lineStyle: { color: '#334155' } },
        minorSplitLine: { show: true, lineStyle: { color: '#0f172a' } },
      },
      series: [
        {
          name: 'Shot-noise limit  σ/√N',
          type: 'line',
          showSymbol: false,
          data: curves.shot,
          lineStyle: { color: '#64748b', width: 1, type: 'dashed' },
          z: 1,
        },
        {
          name: 'Thompson σ_loc(N)',
          type: 'line',
          showSymbol: false,
          smooth: false,
          data: curves.thompson,
          lineStyle: { color: '#f97316', width: 2.5 },
          z: 2,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#475569', type: 'dotted', width: 1 },
            label: {
              color: '#94a3b8',
              fontSize: 10,
              formatter: `N = ${currentPhotons.toLocaleString()}`,
              position: 'insideEndTop',
            },
            data: [{ xAxis: currentPhotons }],
          },
        },
        {
          name: 'Predicted (current N)',
          type: 'scatter',
          symbol: 'circle',
          symbolSize: 11,
          data: [[currentPhotons, currentPred]],
          itemStyle: { color: '#f97316', borderColor: '#fef3c7', borderWidth: 1.5 },
          z: 5,
        },
        ...(hasMeasured
          ? [
              {
                name: `Measured${ratio != null ? `  (${ratio.toFixed(2)}× predicted)` : ''}`,
                type: 'scatter' as const,
                symbol: 'diamond',
                symbolSize: 13,
                data: [[currentPhotons, measuredSigmaLocNm as number]],
                itemStyle: {
                  color: '#22d3ee',
                  borderColor: '#cffafe',
                  borderWidth: 1.5,
                },
                z: 6,
              },
            ]
          : []),
      ],
    }, { notMerge: true });
  }, [curves, currentPhotons, currentPred, measuredSigmaLocNm]);

  const ratio =
    measuredSigmaLocNm !== null && measuredSigmaLocNm > 0
      ? measuredSigmaLocNm / currentPred
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-sm font-medium text-slate-300">Thompson precision</div>
        <div className="text-[10px] text-slate-500 tabular-nums">
          σ_psf={psfSigmaNm}nm · a={pixelSizeNm}nm · b={backgroundPerPixel}
        </div>
      </div>
      <div ref={divRef} className="h-[280px] w-full" />
      <div className="grid grid-cols-3 gap-3 border-t border-slate-800 pt-3 text-xs">
        <div className="flex flex-col">
          <span className="text-slate-500">Predicted</span>
          <span className="font-mono text-sm text-orange-400">
            {currentPred.toFixed(2)} nm
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500">Measured</span>
          <span className="font-mono text-sm text-cyan-400">
            {measuredSigmaLocNm !== null ? `${measuredSigmaLocNm.toFixed(2)} nm` : '—'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500">Ratio (m/p)</span>
          <span className="font-mono text-sm text-slate-200">
            {ratio !== null ? `${ratio.toFixed(2)}×` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
