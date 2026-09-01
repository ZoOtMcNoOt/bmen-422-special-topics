'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart, type ScatterSeriesOption } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { MAX_PHOTONS_PER_CYCLE } from '@/lib/simulator/defaults';
import { thompsonSigmaLoc } from '@/lib/simulator/thompson';
import type { SimulationParams, SimulationResult } from '@/lib/simulator/types';

// Register only the ECharts modules used.
echarts.use([LineChart, ScatterChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  /** Live parameters — draw the theory curve for these. */
  params: SimulationParams;
  /** Last result — its points are plotted at the photon count it was acquired with. */
  result: SimulationResult | null;
};

const N_MIN = 100;
const N_MAX = MAX_PHOTONS_PER_CYCLE;
const SIGMA_MIN_NM = 0.5;
const SIGMA_MAX_NM = 50;
const CURVE_STEPS = 120;

// ECharts can't read CSS variables; these mirror the Tailwind palette
// (`storm` orange is also defined as --color-storm in globals.css).
const C = {
  text: '#cbd5e1',
  muted: '#94a3b8',
  axis: '#475569',
  grid: '#1e293b',
  theory: '#f97316',
  fitter: '#22d3ee',
  measured: '#a78bfa',
  floor: '#64748b',
};

export function ThompsonPlot({ params, result }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);

  const { psfSigmaNm, pixelSizeNm, backgroundPerPixel, photonsPerCycle } = params;

  const curves = useMemo(() => {
    const theory: [number, number][] = [];
    const floor: [number, number][] = [];
    for (let i = 0; i <= CURVE_STEPS; i++) {
      const N = 10 ** (Math.log10(N_MIN) + ((Math.log10(N_MAX) - Math.log10(N_MIN)) * i) / CURVE_STEPS);
      theory.push([N, thompsonSigmaLoc(psfSigmaNm, N, pixelSizeNm, backgroundPerPixel)]);
      floor.push([N, psfSigmaNm / Math.sqrt(N)]);
    }
    return { theory, floor };
  }, [psfSigmaNm, pixelSizeNm, backgroundPerPixel]);

  useEffect(() => {
    if (!divRef.current) return;
    const chart = echarts.init(divRef.current, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(divRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const predicted = thompsonSigmaLoc(psfSigmaNm, photonsPerCycle, pixelSizeNm, backgroundPerPixel);
    const runN = result?.params.photonsPerCycle;
    const points: ScatterSeriesOption[] = [
      {
        name: 'Theory at current brightness',
        type: 'scatter',
        symbolSize: 11,
        data: [[photonsPerCycle, predicted]],
        itemStyle: { color: C.theory, borderColor: '#fff', borderWidth: 1.5 },
        z: 5,
      },
    ];
    if (result && runN) {
      points.push(
        {
          name: "Fitter's own estimate",
          type: 'scatter',
          symbol: 'diamond',
          symbolSize: 13,
          data: [[runN, result.apparentSigmaLocNm]],
          itemStyle: { color: C.fitter, borderColor: '#fff', borderWidth: 1.5 },
          z: 6,
        },
        {
          name: 'Measured vs. true positions',
          type: 'scatter',
          symbol: 'triangle',
          symbolSize: 13,
          data: [[runN, result.empiricalPrecisionNm]],
          itemStyle: { color: C.measured, borderColor: '#fff', borderWidth: 1.5 },
          z: 7,
        }
      );
    }

    chart.setOption(
      {
        animationDuration: 250,
        backgroundColor: 'transparent',
        textStyle: { fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' },
        grid: { left: 60, right: 16, top: 40, bottom: 48 },
        legend: { top: 0, left: 0, textStyle: { color: C.text, fontSize: 12 }, itemWidth: 14, itemHeight: 10 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(15,23,42,0.95)',
          borderColor: C.axis,
          textStyle: { color: C.text, fontSize: 12 },
          valueFormatter: (v: unknown) => `${Number(v).toFixed(2)} nm`,
          axisPointer: { type: 'cross', label: { backgroundColor: C.grid, color: C.text, fontSize: 12 } },
        },
        xAxis: {
          type: 'log',
          min: N_MIN,
          max: N_MAX,
          name: 'Photons per blink',
          nameLocation: 'middle',
          nameGap: 30,
          nameTextStyle: { color: C.muted, fontSize: 12 },
          axisLine: { lineStyle: { color: C.axis } },
          axisLabel: { color: C.muted, fontSize: 12, formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : String(v)) },
          splitLine: { lineStyle: { color: C.grid } },
          minorSplitLine: { show: true, lineStyle: { color: '#0f172a' } },
        },
        yAxis: {
          type: 'log',
          min: SIGMA_MIN_NM,
          max: SIGMA_MAX_NM,
          name: 'Precision (nm)',
          nameLocation: 'middle',
          nameGap: 42,
          nameTextStyle: { color: C.muted, fontSize: 12 },
          axisLine: { lineStyle: { color: C.axis } },
          axisLabel: { color: C.muted, fontSize: 12 },
          splitLine: { lineStyle: { color: C.grid } },
          minorSplitLine: { show: true, lineStyle: { color: '#0f172a' } },
        },
        series: [
          {
            name: 'Best possible (no background)',
            type: 'line',
            showSymbol: false,
            data: curves.floor,
            lineStyle: { color: C.floor, width: 1, type: 'dashed' },
            z: 1,
          },
          {
            name: 'Theory',
            type: 'line',
            showSymbol: false,
            data: curves.theory,
            lineStyle: { color: C.theory, width: 2.5 },
            z: 2,
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: C.axis, type: 'dotted' },
              label: { show: false },
              data: [{ xAxis: photonsPerCycle }],
            },
          },
          ...points,
        ],
      },
      { notMerge: true } // so a cleared result's points disappear
    );
  }, [curves, photonsPerCycle, psfSigmaNm, pixelSizeNm, backgroundPerPixel, result]);

  return (
    <div className="flex flex-col gap-3">
      <div ref={divRef} className="h-72 w-full" />
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <Term color={C.theory} name="Theory">
          The best precision an isolated molecule with this many photons can give (Thompson, Larson &amp; Webb, 2002).
          The dashed line is the same with zero background.
        </Term>
        <Term color={C.fitter} name="Fitter's own estimate">
          The same formula applied to each detected blink. Optimistic when two molecules overlap — the fitter counts their photons as one.
        </Term>
        <Term color={C.measured} name="Measured vs. truth">
          Median distance from each localization to the nearest real molecule. This is the honest number used in the headline.
        </Term>
      </dl>
    </div>
  );
}

function Term({ color, name, children }: { color: string; name: string; children: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 font-medium text-foreground">
        <span className="inline-block size-2 rounded-full" style={{ background: color }} />
        {name}
      </dt>
      <dd className="mt-0.5 leading-snug text-muted-foreground">{children}</dd>
    </div>
  );
}
