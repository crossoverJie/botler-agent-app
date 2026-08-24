import './style.css';
import { toPng } from 'html-to-image';
import { state, setState, subscribe, type View } from './state';
import { h, mount } from './utils/dom';
import { addDays, addMonths, fmt, monthLabel } from './utils/date';
import { renderSummary } from './components/summary';
import { renderMonth } from './views/month';
import { renderWeek } from './views/week';
import { renderDay } from './views/day';
import { renderYear } from './views/year';
import { initTrend, updateTrend } from './charts/trend';
import { closeDrawer, isDrawerOpen } from './components/drawer';

const VIEWS: { key: View; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' },
];

function focusedLabel(): string {
  const d = state.selectedDate;
  switch (state.view) {
    case 'day':
      return fmt(d);
    case 'week': {
      const start = addDays(d, -((d.getDay() + 6) % 7));
      const end = addDays(start, 6);
      return `${fmt(start)} ~ ${fmt(end)}`;
    }
    case 'month':
      return monthLabel(d);
    case 'year':
      return `${d.getFullYear()} 年`;
  }
}

function navStep(dir: number): void {
  const d = state.selectedDate;
  switch (state.view) {
    case 'day':
      setState({ selectedDate: addDays(d, dir) });
      break;
    case 'week':
      setState({ selectedDate: addDays(d, dir * 7) });
      break;
    case 'month':
      setState({ selectedDate: addMonths(d, dir) });
      break;
    case 'year':
      setState({ selectedDate: new Date(d.getFullYear() + dir, d.getMonth(), 1) });
      break;
  }
}

function renderView(): HTMLElement {
  switch (state.view) {
    case 'day':
      return renderDay();
    case 'week':
      return renderWeek();
    case 'month':
      return renderMonth();
    case 'year':
      return renderYear();
  }
}

let navLabel: HTMLElement;
let viewContainer: HTMLElement;
let trendContainer: HTMLElement;
let viewButtons: Record<View, HTMLElement> = {} as Record<View, HTMLElement>;

function render(): void {
  navLabel.textContent = focusedLabel();
  renderSummary();
  mount(viewContainer, renderView());
  updateTrend();
  for (const v of VIEWS) {
    viewButtons[v.key].classList.toggle('active', state.view === v.key);
  }
}

function buildShell(): void {
  const app = document.getElementById('app')!;

  // view switch
  const viewSwitch = h('div', { class: 'view-switch' });
  for (const v of VIEWS) {
    const btn = h('button', { class: 'view-btn', onclick: () => setState({ view: v.key }) }, [v.label]);
    viewButtons[v.key] = btn;
    viewSwitch.append(btn);
  }

  // date navigation
  const nav = h('div', { class: 'nav' }, [
    h('button', { class: 'nav-btn', title: '上一项', onclick: () => navStep(-1) }, ['‹']),
    (navLabel = h('span', { class: 'nav-label' }, [''])),
    h('button', { class: 'nav-btn', title: '下一项', onclick: () => navStep(1) }, ['›']),
    h('button', { class: 'nav-btn today', title: '回到今天', onclick: () => setState({ selectedDate: new Date() }) }, [
      '今天',
    ]),
  ]);

  // legend
  const legend = h('div', { class: 'legend' }, [
    legendItem('#38bdf8', '偏低'),
    legendItem('#22c55e', '达标'),
    legendItem('#ef4444', '超目标'),
  ]);

  // export button
  const exportBtn = h(
    'button',
    { class: 'export-btn', title: '导出当前视图为 PNG', onclick: doExport },
    ['导出图片'],
  );

  const backLink = h('a', { class: 'back-link', href: 'https://crossoverjie.top/index/' }, ['← 返回首页']);

  const topbar = h('header', { class: 'topbar' }, [
    backLink,
    h('div', { class: 'brand' }, ['营养日历仪表盘']),
    nav,
    viewSwitch,
    legend,
    exportBtn,
  ]);

  viewContainer = h('div', { class: 'view-container' });
  trendContainer = h('div', { class: 'trend-container' });
  const summary = h('div', { class: 'summary', id: 'summary' });

  const capture = h('div', { class: 'capture', id: 'capture' }, [summary, viewContainer, trendContainer]);

  app.append(topbar, capture);
}

function legendItem(color: string, label: string): HTMLElement {
  return h('span', { class: 'legend-item' }, [
    h('span', { class: 'legend-dot', style: `background:${color}` }, []),
    label,
  ]);
}

async function doExport(): Promise<void> {
  const node = document.getElementById('capture');
  if (!node) return;
  try {
    const dataUrl = await toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `nutrition-${fmt(state.selectedDate)}-${state.view}.png`;
    a.click();
  } catch (e) {
    console.error('导出失败', e);
    alert('导出失败，请查看控制台。');
  }
}

function applyUrlParams(): void {
  const params = new URLSearchParams(location.search);
  const view = params.get('view');
  if (view === 'day' || view === 'week' || view === 'month' || view === 'year') {
    state.view = view;
  }
  const date = params.get('date');
  if (date) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, d] = date.split('-').map(Number);
      state.selectedDate = new Date(y, m - 1, d);
    } else if (/^\d{4}$/.test(date)) {
      // year-only (e.g. ?date=2026 for the year view)
      state.selectedDate = new Date(Number(date), 0, 1);
    }
  }
  // export mode: kill transitions/animations so headless screenshots are stable
  if (params.get('export') === '1') {
    document.body.classList.add('export-mode');
  }
}

function main(): void {
  applyUrlParams();
  buildShell();
  initTrend(trendContainer);
  subscribe(render);
  render();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDrawerOpen()) closeDrawer();
  });
}

main();
