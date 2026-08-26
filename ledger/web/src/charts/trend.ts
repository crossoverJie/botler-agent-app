import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { MonthlyRow } from '../types';
import { money, escHTML } from '../utils/format';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export interface ChartCtl {
  resize(): void;
}

export function initTrend(container: HTMLElement, rows: MonthlyRow[]): ChartCtl {
  const chart = echarts.init(container);
  const months = rows.map((r) => r.month);
  const income = rows.map((r) => r.income);
  const expense = rows.map((r) => r.expense);
  const balance = rows.map((r) => r.balance);
  const savings = rows.map((r) =>
    r.income > 0 ? Math.round((r.balance / r.income) * 1000) / 10 : null,
  );
  const n = months.length;
  const startPct = n > 12 ? ((n - 12) / n) * 100 : 0;

  chart.setOption({
    animation: false,
    grid: { left: 56, right: 52, top: 32, bottom: 64 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: { axisValue: string; seriesName: string; value: number | null }[]) => {
        const lines = [escHTML(ps[0].axisValue)];
        for (const p of ps) {
          if (p.value == null) continue;
          const v = p.seriesName === '储蓄率' ? `${p.value}%` : money(p.value as number);
          lines.push(`${escHTML(p.seriesName)}: ${v}`);
        }
        return lines.join('<br/>');
      },
    },
    legend: { top: 0, textStyle: { color: '#64748b', fontSize: 11 } },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { fontSize: 11, color: '#64748b' },
      axisLine: { lineStyle: { color: '#cbd5e1' } },
    },
    yAxis: [
      {
        type: 'value',
        name: '元',
        nameTextStyle: { color: '#94a3b8' },
        splitLine: { lineStyle: { color: '#eef2f7' } },
        axisLabel: { color: '#94a3b8' },
      },
      {
        type: 'value',
        name: '储蓄率%',
        nameTextStyle: { color: '#94a3b8' },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: 'inside', start: startPct, end: 100 },
      {
        type: 'slider',
        start: startPct,
        end: 100,
        height: 18,
        bottom: 14,
        borderColor: '#e2e8f0',
        fillerColor: 'rgba(99,102,241,0.12)',
        handleStyle: { color: '#6366f1' },
        textStyle: { color: '#94a3b8' },
      },
    ],
    series: [
      { name: '收入', type: 'bar', data: income, barMaxWidth: 16, itemStyle: { color: '#2a9d5f', borderRadius: [2, 2, 0, 0] } },
      { name: '支出', type: 'bar', data: expense, barMaxWidth: 16, itemStyle: { color: '#e0563a', borderRadius: [2, 2, 0, 0] } },
      {
        name: '结余',
        type: 'line',
        data: balance,
        symbolSize: 5,
        lineStyle: { width: 2, color: '#6366f1' },
        itemStyle: { color: '#6366f1' },
      },
      {
        name: '储蓄率',
        type: 'line',
        yAxisIndex: 1,
        data: savings,
        symbolSize: 4,
        lineStyle: { width: 1.5, color: '#f59e0b', type: 'dashed' },
        itemStyle: { color: '#f59e0b' },
      },
    ],
  });
  return { resize: () => chart.resize() };
}
