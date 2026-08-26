import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { NamedAmount } from '../types';
import { money, escHTML } from '../utils/format';

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface ChartCtl {
  resize(): void;
}

function donut(container: HTMLElement, items: NamedAmount[], emptyText: string): echarts.ECharts {
  const chart = echarts.init(container);
  const data = items
    .map((it) => ({ name: it.name, value: Math.max(it.amount, 0) }))
    .filter((d) => d.value > 0);
  if (!data.length) {
    chart.setOption({ title: { text: emptyText, left: 'center', top: 'center', textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 'normal' } } });
    return chart;
  }
  chart.setOption({
    tooltip: {
      trigger: 'item',
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${escHTML(p.name)}<br/>${money(p.value)} (${p.percent}%)`,
    },
    legend: { type: 'scroll', bottom: 0, textStyle: { color: '#64748b', fontSize: 11 } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '44%'],
        data,
        label: { show: false },
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
      },
    ],
  });
  return chart;
}

export function initAccountPie(
  container: HTMLElement,
  accounts: NamedAmount[],
  payers: NamedAmount[],
): ChartCtl {
  const aEl = document.createElement('div');
  aEl.className = 'sub-chart';
  const pEl = document.createElement('div');
  pEl.className = 'sub-chart';
  container.append(aEl, pEl);
  const aChart = donut(aEl, accounts, '暂无账户支出');
  const pChart = donut(pEl, payers, '单人付款');
  return { resize: () => { aChart.resize(); pChart.resize(); } };
}
