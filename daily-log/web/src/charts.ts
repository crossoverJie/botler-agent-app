import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { DatasetInstance, BaseRec, Bucket } from './data';
import { poopBristolCounts, peeColorCounts, peeVolumeCounts } from './data';
import type { PoopRecord, PeeRecord } from './types';

echarts.use([
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export type ExtraKind = 'bristol' | 'color' | 'volume';

export interface ChartRefs {
  trend: HTMLElement;
  feeling: HTMLElement;
  extra: Partial<Record<ExtraKind, HTMLElement>>;
  hour: HTMLElement;
}

export interface ChartSpec {
  trend: boolean;
  feeling: boolean;
  /** 每个元素一张分类图：poop 用 bristol；pee 用 color + volume */
  extra: ExtraKind[];
  hour: boolean;
}

const AXIS_COLOR = '#94a3b8';
const SPLIT_COLOR = '#eef2f7';

/** 每个数据集一个控制器实例，各自独立 mode；懒初始化 + 切回可见时 resize（避免隐藏容器零尺寸）。 */
export class ChartController {
  private trendChart: echarts.ECharts | null = null;
  private feelingChart: echarts.ECharts | null = null;
  private hourChart: echarts.ECharts | null = null;
  private extraCharts = new Map<ExtraKind, echarts.ECharts>();
  private mode: 'day' | 'week' = 'day';
  private inited = false;

  constructor(
    private refs: ChartRefs,
    private dataset: DatasetInstance<BaseRec>,
    private spec: ChartSpec,
  ) {}

  private getExtraData(kind: ExtraKind): Bucket[] {
    if (kind === 'bristol') {
      return poopBristolCounts(this.dataset as DatasetInstance<PoopRecord>).map((b) => ({
        label: b.n == null ? '未记录' : b.label,
        value: b.value,
        color: b.color,
      }));
    }
    if (kind === 'color') return peeColorCounts(this.dataset as DatasetInstance<PeeRecord>);
    return peeVolumeCounts(this.dataset as DatasetInstance<PeeRecord>);
  }

  /** 懒初始化：仅在首次切到该数据集时 echarts.init */
  ensureInit(): void {
    if (this.inited) return;
    const s = this.spec;
    if (s.trend) this.trendChart = echarts.init(this.refs.trend);
    if (s.feeling) this.feelingChart = echarts.init(this.refs.feeling);
    for (const k of s.extra) {
      const el = this.refs.extra[k];
      if (el) this.extraCharts.set(k, echarts.init(el));
    }
    if (s.hour) this.hourChart = echarts.init(this.refs.hour);
    window.addEventListener('resize', this.onResize);
    this.inited = true;
  }

  private onResize = (): void => {
    this.resize();
  };

  setMode(m: 'day' | 'week'): void {
    this.mode = m;
  }

  /** 切回可见容器后调用，恢复图表尺寸 */
  resize(): void {
    if (!this.inited) return;
    this.trendChart?.resize();
    this.feelingChart?.resize();
    this.hourChart?.resize();
    this.extraCharts.forEach((c) => c.resize());
  }

  renderAll(): void {
    if (!this.inited) return;
    if (this.spec.trend) this.renderTrend();
    if (this.spec.feeling) this.renderFeeling();
    for (const k of this.spec.extra) {
      const chart = this.extraCharts.get(k);
      if (chart) this.renderExtra(chart, this.getExtraData(k));
    }
    if (this.spec.hour) this.renderHour();
  }

  private renderTrend(): void {
    if (!this.trendChart) return;
    const daily = this.mode === 'day';
    const data = daily ? this.dataset.trendDaily(30) : this.dataset.trendWeekly(12);
    this.trendChart.setOption({
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

  private renderFeeling(): void {
    if (!this.feelingChart) return;
    const data = this.dataset.feelingCounts();
    this.feelingChart.setOption({
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

  private renderExtra(chart: echarts.ECharts, data: Bucket[]): void {
    chart.setOption({
      animation: false,
      grid: { left: 44, right: 16, top: 24, bottom: 30 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: data.map((b) => b.label),
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

  private renderHour(): void {
    if (!this.hourChart) return;
    const data = this.dataset.hourCounts();
    this.hourChart.setOption({
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
}
