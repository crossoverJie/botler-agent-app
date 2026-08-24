import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { config, sortedRecords } from '../data';
import { calColor } from '../utils/macros';

echarts.use([
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  LegendComponent,
  CanvasRenderer,
]);

let chart: echarts.ECharts | null = null;

export function initTrend(container: HTMLElement): void {
  chart = echarts.init(container);
  window.addEventListener('resize', () => chart?.resize());
}

export function updateTrend(): void {
  if (!chart) return;
  const recs = sortedRecords();
  const dates = recs.map((r) => r.date);
  const cals = recs.map((r) => Math.round(r.calories));
  const waters = recs.map((r) => r.water ?? null);
  const tdee = config.tdee;

  // default: show the most recent ~90 days, slidable to the full year+
  const n = dates.length;
  const startPct = n > 90 ? ((n - 90) / n) * 100 : 0;

  chart.setOption({
    animation: false,
    grid: { left: 52, right: 16, top: 20, bottom: 64 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => `${v} kcal`,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 11, color: '#64748b' },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    yAxis: {
      type: 'value',
      name: 'kcal',
      nameTextStyle: { color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#eef2f7' } },
      axisLabel: { color: '#94a3b8' },
    },
    dataZoom: [
      { type: 'inside', start: startPct, end: 100 },
      {
        type: 'slider',
        start: startPct,
        end: 100,
        height: 20,
        bottom: 12,
        borderColor: '#e2e8f0',
        fillerColor: 'rgba(99,102,241,0.12)',
        handleStyle: { color: '#6366f1' },
        textStyle: { color: '#94a3b8' },
      },
    ],
    series: [
      {
        name: '热量',
        type: 'bar',
        data: cals,
        barMaxWidth: 18,
        itemStyle: {
          color: (p: { value: number }) => calColor(p.value, tdee),
          borderRadius: [2, 2, 0, 0],
        },
        markLine: {
          symbol: 'none',
          data: [{ yAxis: tdee, name: 'TDEE' }],
          lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
          label: { formatter: `TDEE ${tdee}`, color: '#ef4444', position: 'insideEndTop' },
        },
      },
      {
        name: '饮水',
        type: 'line',
        data: waters,
        connectNulls: false,
        symbolSize: 4,
        lineStyle: { width: 1.5, color: '#0ea5e9' },
        itemStyle: { color: '#0ea5e9' },
        markLine: {
          symbol: 'none',
          data: [{ yAxis: config.targets.waterMin, name: '饮水目标' }],
          lineStyle: { color: '#38bdf8', type: 'dashed', width: 1 },
          label: {
            formatter: `水 ${config.targets.waterMin}ml`,
            color: '#0ea5e9',
            position: 'insideEndTop',
          },
        },
      },
    ],
  });
}
