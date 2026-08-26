import { h, mount } from '../utils/dom';
import type { Aggregates } from '../types';
import type { IconName } from '../icons';
import { money, pct } from '../utils/format';
import { icon } from '../icons';

function kpi(label: string, value: string, sub?: string, iconName?: IconName, accent?: string): HTMLElement {
  const children: (Node | string)[] = [];
  if (iconName) children.push(h('span', { class: 'kpi-ico', html: icon(iconName) }));
  children.push(h('div', { class: 'card-label' }, [label]));
  children.push(
    h('div', { class: 'card-value', style: accent ? `color:${accent}` : '' }, [value]),
  );
  if (sub) children.push(h('div', { class: 'card-sub' }, [sub]));
  return h('div', { class: 'card kpi' }, children);
}

export function renderSummary(host: HTMLElement, agg: Aggregates): void {
  const s = agg.summary;
  const grossExp = s.netExpense + s.totalRefund;
  const cards: HTMLElement[] = [
    kpi('总收入', money(s.totalIncome), undefined, 'income', '#2a9d5f'),
    kpi('净支出', money(s.netExpense), `支出 ${money(grossExp)} − 退款 ${money(s.totalRefund)}`, 'expense', '#e0563a'),
  ];
  if (s.totalRefund > 0) cards.push(kpi('退款', money(s.totalRefund), undefined, 'refund', '#94a3b8'));
  cards.push(kpi('结余', money(s.balance), '收入 − 净支出', undefined, '#6366f1'));
  if (s.savingsRate != null) cards.push(kpi('储蓄率', pct(s.savingsRate), '结余 / 收入', undefined, '#6366f1'));

  mount(host, h('div', { class: 'cards' }, cards));
}
