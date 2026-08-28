import './style.css';
import { records } from './data';
import { state, setState, setMasked, subscribe, type View, type TypeFilter } from './state';
import { h } from './utils/dom';
import { renderSummary } from './components/summary';
import { renderDetail } from './components/detail';
import { renderEmpty } from './components/empty';
import { initCharts, resizeCharts, updateCharts } from './charts';
import { computeAggregates } from './utils/aggregate';
import { closeDrawer, isDrawerOpen, refreshDrawer } from './components/drawer';
import { icon } from './icons';

const agg = computeAggregates(records);

const TABS: { key: View; label: string }[] = [
  { key: 'summary', label: '汇总' },
  { key: 'all', label: '全部流水' },
  { key: 'day', label: '按天' },
  { key: 'category', label: '按分类' },
  { key: 'payer', label: '按付款人' },
  { key: 'account', label: '按账户' },
  { key: 'trip', label: '按行程' },
  { key: 'payee', label: '按交易对象' },
];

const TYPE_BTNS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
  { key: 'refund', label: '退款' },
];

let summaryPanel: HTMLElement;
let kpiHost: HTMLElement;
let chartsHost: HTMLElement;
let detailPanel: HTMLElement;
let detailHost: HTMLElement;
const tabButtons: Partial<Record<View, HTMLElement>> = {};
const typeButtons: Partial<Record<TypeFilter, HTMLElement>> = {};

function render(): void {
  const isSummary = state.view === 'summary';
  summaryPanel.hidden = !isSummary;
  detailPanel.hidden = isSummary;
  for (const t of TABS) tabButtons[t.key]?.classList.toggle('active', state.view === t.key);
  for (const b of TYPE_BTNS) typeButtons[b.key]?.classList.toggle('active', state.typeFilter === b.key);

  if (isSummary) {
    resizeCharts();
  } else {
    renderDetail(detailHost);
  }
}

function buildShell(): void {
  const app = document.getElementById('app')!;

  const back = h('a', { class: 'back-link', href: 'https://crossoverjie.top/index/' }, ['← 返回首页']);
  const brand = h('div', { class: 'brand' }, ['记账仪表盘']);

  const search = h('input', {
    id: 'search',
    class: 'search',
    type: 'search',
    placeholder: '搜索备注/交易对象/分类/标签…',
  }) as HTMLInputElement;
  search.addEventListener('input', () => {
    const q = search.value;
    if (q.trim() && state.view === 'summary') {
      setState({ search: q, view: 'all' });
    } else {
      setState({ search: q });
    }
  });

  const typeFilter = h('div', { class: 'type-filter' });
  for (const b of TYPE_BTNS) {
    const btn = h('button', {
      class: 'type-btn' + (b.key === 'all' ? ' active' : ''),
      dataset: { type: b.key },
      onclick: () => setState(state.view === 'summary' ? { typeFilter: b.key, view: 'all' } : { typeFilter: b.key }),
    }, [b.label]);
    typeButtons[b.key] = btn;
    typeFilter.append(btn);
  }

  // 一键屏蔽金额按钮(视觉脱敏,持久化到 localStorage)
  const maskBtn = h('button', {
    class: 'mask-btn' + (state.masked ? ' active' : ''),
    title: state.masked ? '显示金额' : '屏蔽金额',
    dataset: { mask: '1' },
    onclick: () => toggleMask(maskBtn),
  }, [h('span', { class: 'mask-ico', html: icon(state.masked ? 'eyeOff' : 'eye') }), h('span', { class: 'mask-label' }, [state.masked ? '金额已隐藏' : '屏蔽金额'])]);

  const toolbar = h('div', { class: 'toolbar' }, [search, typeFilter, maskBtn]);

  const tabs = h('div', { class: 'tabs' });
  for (const t of TABS) {
    const btn = h('button', {
      class: 'tab' + (t.key === 'summary' ? ' active' : ''),
      dataset: { view: t.key },
      onclick: () => setState({ view: t.key }),
    }, [t.label]);
    tabButtons[t.key] = btn;
    tabs.append(btn);
  }

  kpiHost = h('div', { class: 'kpi-host' });
  chartsHost = h('div', { class: 'charts-host' });
  summaryPanel = h('div', { class: 'panel', id: 'panel-summary' }, [kpiHost, chartsHost]);
  detailHost = h('div', { id: 'detail' });
  detailPanel = h('div', { class: 'panel', id: 'panel-detail', hidden: true }, [detailHost]);

  const header = h('header', {}, [back, brand, h('span', { class: 'src-note' }, ['single source of truth: data/days/'])]);
  app.append(header, toolbar, tabs, summaryPanel, detailPanel);

  // 一次性构建汇总(静态):KPI + 图表
  renderSummary(kpiHost, agg);
  initCharts(chartsHost, agg);
}

function toggleMask(btn: HTMLElement): void {
  const next = !state.masked;
  setMasked(next);
  btn.classList.toggle('active', next);
  btn.title = next ? '显示金额' : '屏蔽金额';
  (btn.querySelector('.mask-ico') as HTMLElement).innerHTML = icon(next ? 'eyeOff' : 'eye');
  (btn.querySelector('.mask-label') as HTMLElement).textContent = next ? '金额已隐藏' : '屏蔽金额';
  // 金额展示层随开关刷新:KPI 卡片 / 明细 / 图表 / 抽屉
  renderSummary(kpiHost, agg);
  if (state.view !== 'summary') renderDetail(detailHost);
  updateCharts();
  refreshDrawer();
}

function main(): void {
  const app = document.getElementById('app')!;
  if (agg.empty) {
    app.append(
      h('header', {}, [h('div', { class: 'brand' }, ['记账仪表盘'])]),
      h('main', { class: 'main' }, [h('div', {})]),
    );
    renderEmpty(app.querySelector('.main') as HTMLElement);
    return;
  }
  buildShell();
  subscribe(render);
  render();
  window.addEventListener('resize', () => resizeCharts());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isDrawerOpen()) closeDrawer();
  });
}

main();
