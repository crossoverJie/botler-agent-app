import { config, records, sortedRecords } from '../data';
import { state } from '../state';
import type { DayRecord } from '../types';
import { h, mount } from '../utils/dom';
import { computeStats } from '../utils/macros';
import { fmt, getWeekDates, monthLabel } from '../utils/date';

function scopeRecords(): DayRecord[] {
  const d = state.selectedDate;
  const inScope = (dateStr: string): boolean => {
    const rec = records.get(dateStr);
    if (!rec) return false;
    const dt = new Date(dateStr);
    switch (state.view) {
      case 'day':
        return dateStr === fmt(d);
      case 'week': {
        const wk = getWeekDates(d);
        return wk.some((w) => fmt(w) === dateStr);
      }
      case 'month':
        return dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth();
      case 'year':
        return dt.getFullYear() === d.getFullYear();
    }
  };
  return sortedRecords().filter((r) => inScope(r.date));
}

function scopeLabel(): string {
  const d = state.selectedDate;
  switch (state.view) {
    case 'day':
      return fmt(d);
    case 'week': {
      const wk = getWeekDates(d);
      return `${fmt(wk[0])} ~ ${fmt(wk[6])}`;
    }
    case 'month':
      return monthLabel(d);
    case 'year':
      return `${d.getFullYear()} 年`;
  }
}

function card(label: string, value: string, sub?: string, accent?: string): HTMLElement {
  return h('div', { class: 'card' }, [
    h('div', { class: 'card-label' }, [label]),
    h('div', { class: 'card-value', style: accent ? `color:${accent}` : '' }, [value]),
    sub ? h('div', { class: 'card-sub' }, [sub]) : document.createTextNode(''),
  ]);
}

export function renderSummary(): void {
  const host = document.getElementById('summary')!;
  const stats = computeStats(scopeRecords(), config);
  const cards: HTMLElement[] = [
    card('总热量', stats.count ? `${Math.round(stats.totalCalories)}` : '—', 'kcal'),
    card('日均热量', stats.count ? `${Math.round(stats.avgCalories)}` : '—', `目标 ${config.tdee}`),
    card(
      '日均缺口',
      stats.count ? `${stats.avgDeficitPct.toFixed(0)}%` : '—',
      `上限 ${config.targets.deficitMaxPct}%`,
      stats.avgDeficitPct > config.targets.deficitMaxPct ? '#ef4444' : undefined,
    ),
    card(
      '蛋白',
      stats.count ? `${stats.avgProtein.toFixed(1)} g` : '—',
      `${stats.avgProteinPerKg.toFixed(2)} g/kg · 目标 ≥${config.targets.proteinPerKgMin} g/kg`,
      stats.avgProteinPerKg < config.targets.proteinPerKgMin ? '#ef4444' : undefined,
    ),
    card(
      '碳水',
      stats.count ? `${stats.avgCarb.toFixed(1)}` : '—',
      `g · 目标 ${config.targets.carbMin}-${config.targets.carbMax}`,
      stats.count && (stats.avgCarb < config.targets.carbMin || stats.avgCarb > config.targets.carbMax)
        ? '#ef4444'
        : undefined,
    ),
    card(
      '纤维',
      stats.count ? `${stats.avgFiber.toFixed(1)}` : '—',
      `g · 目标 ≥${config.targets.fiberMin}`,
      stats.avgFiber < config.targets.fiberMin ? '#ef4444' : undefined,
    ),
    card(
      '日均饮水',
      stats.avgWater ? `${Math.round(stats.avgWater)}` : '—',
      `ml · 目标 ≥${config.targets.waterMin}`,
      stats.avgWater && stats.avgWater < config.targets.waterMin ? '#ef4444' : undefined,
    ),
  ];
  mount(
    host,
    h('div', { class: 'summary-label' }, [`汇总范围：${scopeLabel()}（${stats.count} 天有记录）`]),
    h('div', { class: 'cards' }, cards),
  );
}
