import { h, mount } from './utils/dom';
import type { DatasetInstance, BaseRec } from './data';
import { relativeLabel } from './utils/date';

/** 通用汇总卡片：总次数 / 近7天 / 近30天 / 最近一次 + 各数据集注入的额外卡（poop 平均时长+间隔，pee 平均尿量）。 */
export function renderSummary(
  container: HTMLElement,
  dataset: DatasetInstance<BaseRec>,
  extraStats: { label: string; value: string }[],
): void {
  const items: { label: string; value: string }[] = [
    { label: '总次数', value: String(dataset.totalCount()) },
    { label: '近 7 天', value: String(dataset.countLastDays(7)) },
    { label: '近 30 天', value: String(dataset.countLastDays(30)) },
    { label: '最近一次', value: dataset.latest() ? relativeLabel(dataset.latest()!.startedAt) : '—' },
    ...extraStats,
  ];

  mount(
    container,
    ...items.map((it) =>
      h('div', { class: 'stat-card' }, [
        h('div', { class: 'stat-label' }, [it.label]),
        h('div', { class: 'stat-value' }, [it.value]),
      ]),
    ),
  );
}
