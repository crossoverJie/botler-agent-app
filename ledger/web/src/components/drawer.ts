import { h, mount } from '../utils/dom';
import type { LedgerRecord } from '../types';
import { money } from '../utils/format';

let backdrop: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let body: HTMLElement | null = null;
let title: HTMLElement | null = null;
let current: LedgerRecord | null = null;

function ensureDom(): void {
  if (panel) return;
  backdrop = h('div', { class: 'drawer-backdrop', onclick: closeDrawer });
  body = h('div', { class: 'drawer-body' });
  title = h('div', { class: 'drawer-title' });
  const close = h('button', { class: 'drawer-close', onclick: closeDrawer, title: '关闭' }, ['×']);
  panel = h('aside', { class: 'drawer' }, [h('div', { class: 'drawer-head' }, [title, close]), body]);
  document.body.append(backdrop, panel);
}

function row(label: string, value: string): HTMLElement {
  return h('div', { class: 'drawer-row' }, [
    h('span', { class: 'drawer-k' }, [label]),
    h('span', { class: 'drawer-v' }, [value]),
  ]);
}

export function openDrawer(r: LedgerRecord): void {
  ensureDom();
  current = r;
  if (title) title.textContent = `${r.date} · ${r.id}`;
  if (body) {
    mount(
      body,
      row('类型', r.type === 'income' ? '收入' : r.type === 'refund' ? '退款' : '支出'),
      row('金额', money(r.amount_cents)),
      row('账户', r.account),
      row('分类', (r.category || []).join(' / ')),
      row('付款人', r.payer || '我'),
      row('交易对象', r.payee || '—'),
      row('标签', (r.tags || []).join('  ') || '—'),
      row('备注', r.note || '—'),
      r.created_at ? row('创建时间', r.created_at) : document.createTextNode(''),
    );
  }
  requestAnimationFrame(() => {
    backdrop?.classList.add('show');
    panel?.classList.add('show');
  });
}

export function closeDrawer(): void {
  backdrop?.classList.remove('show');
  panel?.classList.remove('show');
  current = null;
}

export function isDrawerOpen(): boolean {
  return !!panel?.classList.contains('show');
}

/** 切换金额屏蔽时,若抽屉开着则按当前 masked 状态重绘金额。 */
export function refreshDrawer(): void {
  if (current) openDrawer(current);
}
