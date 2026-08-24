import { state } from '../state';
import { h, mount } from '../utils/dom';
import { fmt } from '../utils/date';
import { renderDayDetail } from '../views/day';

let backdrop: HTMLElement | null = null;
let panel: HTMLElement | null = null;
let body: HTMLElement | null = null;
let title: HTMLElement | null = null;

function ensureDom(): void {
  if (panel) return;
  backdrop = h('div', { class: 'drawer-backdrop', onclick: closeDrawer });
  body = h('div', { class: 'drawer-body' });
  title = h('div', { class: 'drawer-title' });
  const close = h('button', { class: 'drawer-close', onclick: closeDrawer, title: '关闭' }, ['×']);
  panel = h('aside', { class: 'drawer' }, [
    h('div', { class: 'drawer-head' }, [title, close]),
    body,
  ]);
  document.body.append(backdrop, panel);
}

export function openDrawer(dateStr: string): void {
  ensureDom();
  const rec = state.records.get(dateStr) ?? null;
  if (title) title.textContent = `${dateStr} · 当日明细`;
  if (body) mount(body, renderDayDetail(rec));
  requestAnimationFrame(() => {
    backdrop?.classList.add('show');
    panel?.classList.add('show');
  });
}

export function closeDrawer(): void {
  backdrop?.classList.remove('show');
  panel?.classList.remove('show');
}

/** Expose for keyboard escape handling in main. */
export function isDrawerOpen(): boolean {
  return !!panel?.classList.contains('show');
}

export { fmt };
