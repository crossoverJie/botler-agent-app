import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { CategoryNode } from '../types';
import { money, escHTML } from '../utils/format';

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface ChartCtl {
  resize(): void;
  /** 重新套用 option(切换金额屏蔽后刷新 tooltip/label)。 */
  render(): void;
}

export function initCategoryDonut(container: HTMLElement, cats: CategoryNode[]): ChartCtl {
  const chart = echarts.init(container);
  const data = cats
    .map((c) => ({ name: c.name, value: Math.max(c.amount, 0) }))
    .filter((d) => d.value > 0);
  const option = {
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
  };
  chart.setOption(option);
  return { resize: () => chart.resize(), render: () => chart.setOption(option) };
}
