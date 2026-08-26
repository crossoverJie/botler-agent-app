import type { Aggregates } from '../types';
import { h } from '../utils/dom';
import { initCategoryDonut, type ChartCtl } from './categoryDonut';
import { initTrend } from './trend';
import { initAccountPie } from './accountPie';
import { initTrip } from './trip';

const controllers: ChartCtl[] = [];
let initialized = false;

function card(title: string): { card: HTMLElement; body: HTMLElement } {
  const body = h('div', { class: 'chart-body' });
  const card = h('div', { class: 'chart-card' }, [h('h3', {}, [title]), body]);
  return { card, body };
}

export function initCharts(host: HTMLElement, agg: Aggregates): void {
  if (initialized) return;
  initialized = true;

  const grid = h('div', { class: 'charts-grid' });
  host.append(grid);

  const c1 = card('分类占比(净支出)');
  const c2 = card('月度收支趋势');
  const c3 = card('账户 / 付款人净支出占比');
  const c4 = card('行程分类拆解');
  grid.append(c1.card, c2.card, c3.card, c4.card);

  controllers.push(initCategoryDonut(c1.body, agg.categories));
  controllers.push(initTrend(c2.body, agg.monthly));
  controllers.push(initAccountPie(c3.body, agg.accounts, agg.payers));
  controllers.push(initTrip(c4.body, agg.trips));
}

export function resizeCharts(): void {
  for (const c of controllers) c.resize();
}

export function resetCharts(): void {
  controllers.length = 0;
  initialized = false;
}
