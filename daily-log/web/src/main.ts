import './style.css';
import { h } from './utils/dom';
import { poop, pee, poopAvgDurationSec, poopAvgIntervalDays, peeVolumeCounts } from './data';
import type { DatasetInstance, BaseRec, Bucket } from './data';
import { ChartController, type ChartSpec, type ExtraKind } from './charts';
import { renderSummary } from './summary';
import { initDetail, POOP_DETAIL, PEE_DETAIL, type DetailColumn, type DetailFilter } from './detail';
import { exportShareCard, renderShareCardInto, poopShareConfig, peeShareConfig, type ShareConfig } from './share';
import { fmtDuration } from './utils/date';

function extraTitle(kind: ExtraKind): string {
  if (kind === 'bristol') return '布里斯托分布';
  if (kind === 'color') return '颜色分布';
  return '尿量分布';
}

interface Group {
  dataset: DatasetInstance<BaseRec>;
  el: HTMLElement;
  controller: ChartController;
  shareConfig: ShareConfig;
}

function buildGroup(opts: {
  cfg: ShareConfig;
  dataset: DatasetInstance<BaseRec>;
  summaryExtra: { label: string; value: string }[];
  spec: ChartSpec;
  columns: DetailColumn[];
  filters: DetailFilter[];
  emptyText: string;
}): Group {
  const { cfg, dataset, summaryExtra, spec, columns, filters, emptyText } = opts;

  const summaryEl = h('section', { class: 'summary' });
  const dayBtn = h('button', { class: 'toggle-btn active' }, ['按天']);
  const weekBtn = h('button', { class: 'toggle-btn' }, ['按周']);
  const toggle = h('div', { class: 'toggle' }, [dayBtn, weekBtn]);

  const trendEl = h('div', { class: 'chart' });
  const feelingEl = h('div', { class: 'chart' });
  const hourEl = h('div', { class: 'chart' });

  const extraEls: Partial<Record<ExtraKind, HTMLElement>> = {};
  const extraCards = spec.extra.map((kind) => {
    const el = h('div', { class: 'chart' });
    extraEls[kind] = el;
    return h('section', { class: 'card' }, [h('h2', {}, [extraTitle(kind)]), el]);
  });

  const trendCard = h('section', { class: 'card' }, [h('div', { class: 'card-head' }, [h('h2', {}, ['次数趋势']), toggle]), trendEl]);
  const feelingCard = h('section', { class: 'card' }, [h('h2', {}, ['感受分布']), feelingEl]);
  const hourCard = h('section', { class: 'card' }, [h('h2', {}, ['时段分布']), hourEl]);
  const chartsGrid = h('div', { class: 'charts-grid' }, [trendCard, feelingCard, ...extraCards, hourCard]);

  const detailEl = h('section', { class: 'card detail' });
  const banner =
    dataset.totalCount() === 0
      ? h('div', { class: 'empty-banner' }, [`暂无数据 —— ${emptyText}`])
      : null;
  const el = h('div', { class: 'dataset-group' }, [...(banner ? [banner] : []), summaryEl, chartsGrid, detailEl]);

  const controller = new ChartController({ trend: trendEl, feeling: feelingEl, extra: extraEls, hour: hourEl }, dataset, spec);

  renderSummary(summaryEl, dataset, summaryExtra);
  initDetail(detailEl, dataset, columns, filters);

  dayBtn.addEventListener('click', () => setMode('day'));
  weekBtn.addEventListener('click', () => setMode('week'));
  function setMode(m: 'day' | 'week'): void {
    controller.setMode(m);
    dayBtn.classList.toggle('active', m === 'day');
    weekBtn.classList.toggle('active', m === 'week');
    controller.renderAll();
  }

  return { dataset, el, controller, shareConfig: cfg };
}

function main(): void {
  const app = document.getElementById('app')!;

  const exportBtn = h('button', { class: 'export-btn', onclick: () => void exportShareCard(active.shareConfig) }, ['导出图片']);
  const header = h('header', { class: 'topbar' }, [
    h('a', { class: 'back-link', href: 'https://crossoverjie.top/index/' }, ['← 返回首页']),
    h('h1', { class: 'brand' }, ['每日记录']),
    exportBtn,
  ]);

  const poopTabBtn = h('button', { class: 'tab-btn active', onclick: () => show(poopGroup) }, ['便便']);
  const peeTabBtn = h('button', { class: 'tab-btn', onclick: () => show(peeGroup) }, ['小便']);
  const tabBar = h('div', { class: 'tab-bar' }, [poopTabBtn, peeTabBtn]);

  const poopGroup = buildGroup({
    cfg: poopShareConfig(),
    dataset: poop,
    summaryExtra: [
      { label: '平均时长', value: poopAvgDurationSec(poop) != null ? fmtDuration(poopAvgDurationSec(poop)!) : '—' },
      { label: '平均间隔', value: poopAvgIntervalDays(poop) != null ? `${poopAvgIntervalDays(poop)!.toFixed(1)} 天` : '—' },
    ],
    spec: { trend: true, feeling: true, extra: ['bristol'], hour: true },
    columns: POOP_DETAIL.columns,
    filters: POOP_DETAIL.filters,
    emptyText: '去记录第一条吧（发给 botler：「上大号了」）',
  });

  // 常见尿量：取出现次数最多的「少/一般/多」（忽略未记录）
  const volCounts = peeVolumeCounts(pee).filter((b) => b.label !== '未记录');
  const topVol = volCounts.sort((a, b) => b.value - a.value)[0] as Bucket | undefined;

  const peeGroup = buildGroup({
    cfg: peeShareConfig(),
    dataset: pee,
    summaryExtra: [{ label: '常见尿量', value: topVol ? topVol.label : '—' }],
    spec: { trend: true, feeling: true, extra: ['color', 'volume'], hour: true },
    columns: PEE_DETAIL.columns,
    filters: PEE_DETAIL.filters,
    emptyText: '去记录第一条吧（发给 botler：「尿了」）',
  });

  let active: Group = poopGroup;

  function show(group: Group): void {
    active = group;
    poopGroup.el.style.display = group === poopGroup ? '' : 'none';
    peeGroup.el.style.display = group === peeGroup ? '' : 'none';
    poopTabBtn.classList.toggle('active', group === poopGroup);
    peeTabBtn.classList.toggle('active', group === peeGroup);
    // 懒初始化当前数据集图表；切换回可见时 resize 修复尺寸（避免隐藏容器零尺寸）
    group.controller.ensureInit();
    group.controller.renderAll();
    group.controller.resize();
  }

  app.append(header, tabBar, poopGroup.el, peeGroup.el);
  show(poopGroup);

  // headless 导出模式（?export=1&view=share|dashboard&dataset=poop|pee）：只激活目标数据集
  const params = new URLSearchParams(location.search);
  if (params.get('export') === '1') {
    document.body.classList.add('export-mode');
    const isPee = (params.get('dataset') ?? 'poop') === 'pee';
    // 仅激活目标 Tab，不初始化另一数据集图表（规避隐藏容器零尺寸 + 省资源）
    show(isPee ? peeGroup : poopGroup);
    // 标记当前导出目标分组，供 export.mjs 精确等待（避免命中隐藏的另一数据集 .summary）
    active.el.classList.add('export-group');
    if ((params.get('view') ?? 'share') === 'share') {
      const capture = h('div', { class: 'capture' });
      document.body.append(capture);
      renderShareCardInto(capture, isPee ? peeShareConfig() : poopShareConfig());
    }
  }
}

main();
