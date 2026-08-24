import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { bristolCounts, feelingCounts, hourCounts, trendDaily, trendWeekly } from './data';

echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

type TrendMode = 'day' | 'week';

interface ChartRefs {
  trend: HTMLElement;
  feeling: HTMLElement;
  bristol: HTMLElement;
  hour: HTMLElement;
}

let trendChart: echarts.ECharts | null = null;
let feelingChart: echarts.ECharts | null = null;
let bristolChart: echarts.ECharts | null = null;
let hourChart: echarts.ECharts | null = null;
let mode: TrendMode = 'day';

const AXIS_COLOR = '#94a3b8';
const SPLIT_COLOR = '#eef2f7';

export function initCharts(refs: ChartRefs): void {
  trendChart = echarts.init(refs.trend);
  feelingChart = echarts.init(refs.feeling);
  bristolChart = echarts.init(refs.bristol);
  hourChart = echarts.init(refs.hour);
  window.addEventListener('resize', () => {
    trendChart?.resize();
    feelingChart?.resize();
    bristolChart?.resize();
    hourChart?.resize();
  });
}

export function setTrendMode(m: TrendMode): void {
  mode = m;
}

export function renderAll(): void {
  renderTrend();
  renderFeeling();
  renderBristol();
  renderHour();
}

function renderTrend(): void {
  if (!trendChart) return;
  const daily = mode === 'day';
  const data = daily ? trendDaily(30) : trendWeekly(12);
  trendChart.setOption({
    animation: false,
    grid: { left: 44, right: 16, top: 24, bottom: daily ? 60 : 40 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: data.map((d) => (daily ? d.label.slice(5) : d.label)),
      axisLabel: { color: AXIS_COLOR, fontSize: 11 },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: '次',
      nameTextStyle: { color: AXIS_COLOR },
      splitLine: { lineStyle: { color: SPLIT_COLOR } },
      axisLabel: { color: AXIS_COLOR },
    },
    dataZoom: daily
      ? [
          { type: 'inside' },
          {
            type: 'slider',
            height: 16,
            bottom: 10,
            borderColor: '#e2e8f0',
            textStyle: { color: AXIS_COLOR },
          },
        ]
      : [],
    series: [
      {
        name: '次数',
        type: 'bar',
        data: data.map((d) => d.count),
        barMaxWidth: 20,
        itemStyle: { color: '#6366f1', borderRadius: [3, 3, 0, 0] },
      },
    ],
  });
}

function renderFeeling(): void {
  if (!feelingChart) return;
  const data = feelingCounts();
  feelingChart.setOption({
    animation: false,
    tooltip: { trigger: 'item', formatter: '{b}: {c} 次 ({d}%)' },
    legend: {
      bottom: 0,
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: AXIS_COLOR, fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '70%'],
        center: ['50%', '44%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, formatter: '{b}\n{c} 次', fontSize: 12 } },
        data: data.map((b) => ({ name: b.label, value: b.value, itemStyle: { color: b.color } })),
      },
    ],
  });
}

function renderBristol(): void {
  if (!bristolChart) return;
  const data = bristolCounts();
  bristolChart.setOption({
    animation: false,
    grid: { left: 44, right: 16, top: 24, bottom: 30 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: data.map((b) => (b.n == null ? '未记录' : b.label)),
      axisLabel: { color: AXIS_COLOR, fontSize: 11 },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: SPLIT_COLOR } },
      axisLabel: { color: AXIS_COLOR },
    },
    series: [
      {
        type: 'bar',
        data: data.map((b) => ({ value: b.value, itemStyle: { color: b.color, borderRadius: [3, 3, 0, 0] } })),
        barMaxWidth: 26,
      },
    ],
  });
}

function renderHour(): void {
  if (!hourChart) return;
  const data = hourCounts();
  hourChart.setOption({
    animation: false,
    grid: { left: 44, right: 16, top: 24, bottom: 30 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: data.map((_, i) => `${i}`),
      axisLabel: { color: AXIS_COLOR, fontSize: 10, interval: 2 },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: SPLIT_COLOR } },
      axisLabel: { color: AXIS_COLOR },
    },
    series: [
      {
        type: 'bar',
        data,
        barMaxWidth: 14,
        itemStyle: { color: '#0ea5e9', borderRadius: [3, 3, 0, 0] },
      },
    ],
  });
}
