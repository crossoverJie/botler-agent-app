import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { TripRow } from '../types';
import { money, escHTML } from '../utils/format';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface ChartCtl {
  resize(): void;
}

export function initTrip(container: HTMLElement, trips: TripRow[]): ChartCtl {
  const chart = echarts.init(container);
  if (!trips.length) {
    chart.setOption({
      title: {
        text: '暂无行程(打 旅行:<行程名> 标签)', left: 'center', top: 'center',
        textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' },
      },
    });
    return { resize: () => chart.resize() };
  }
  const tripNames = trips.map((t) => t.trip);
  // 收集所有一级分类作为堆叠系列
  const cats = new Set<string>();
  for (const t of trips) for (const c of t.categories) cats.add(c.name);
  const series = [...cats].map((cat) => ({
    name: cat,
    type: 'bar' as const,
    stack: 'total',
    data: trips.map((t) => {
      const found = t.categories.find((c) => c.name === cat);
      return found ? found.amount : 0;
    }),
    itemStyle: { borderRadius: [0, 0, 0, 0] },
  }));
  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: { name: string; seriesName: string; value: number }[]) => {
        const lines = [escHTML(ps[0].name)];
        for (const p of ps) {
          if (!p.value) continue;
          lines.push(`${escHTML(p.seriesName)}: ${money(p.value)}`);
        }
        return lines.join('<br/>');
      },
    },
    legend: { type: 'scroll', top: 0, textStyle: { color: '#64748b', fontSize: 11 } },
    grid: { left: 56, right: 16, top: 32, bottom: 24 },
    xAxis: {
      type: 'category',
      data: tripNames,
      axisLabel: { fontSize: 11, color: '#64748b' },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    yAxis: {
      type: 'value',
      name: '元',
      nameTextStyle: { color: '#94a3b8' },
      splitLine: { lineStyle: { color: '#eef2f7' } },
      axisLabel: { color: '#94a3b8' },
    },
    series,
  });
  return { resize: () => chart.resize() };
}
