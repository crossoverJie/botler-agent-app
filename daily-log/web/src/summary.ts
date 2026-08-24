import { h, mount } from './utils/dom';
import { totalCount, countLastDays, avgDurationSec, avgIntervalDays, latest } from './data';
import { fmtDuration, relativeLabel } from './utils/date';

export function renderSummary(container: HTMLElement): void {
  const items: { label: string; value: string }[] = [
    { label: '总次数', value: String(totalCount()) },
    { label: '近 7 天', value: String(countLastDays(7)) },
    { label: '近 30 天', value: String(countLastDays(30)) },
    { label: '平均时长', value: avgDurationSec() != null ? fmtDuration(avgDurationSec()!) : '—' },
    { label: '平均间隔', value: avgIntervalDays() != null ? `${avgIntervalDays()!.toFixed(1)} 天` : '—' },
    { label: '最近一次', value: latest() ? relativeLabel(latest()!.startedAt) : '—' },
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
