import './style.css';
import { h } from './utils/dom';
import { totalCount } from './data';
import { initCharts, renderAll, setTrendMode } from './charts';
import { renderSummary } from './summary';
import { initDetail } from './detail';
import { exportShareCard, renderShareCardInto } from './share';

function main(): void {
  const app = document.getElementById('app')!;

  const exportBtn = h('button', { class: 'export-btn', onclick: () => void exportShareCard() }, [
    '导出图片',
  ]);
  const header = h('header', { class: 'topbar' }, [
    h('a', { class: 'back-link', href: 'https://crossoverjie.top/index/' }, ['← 返回首页']),
    h('h1', { class: 'brand' }, ['每日记录 · 便便日志']),
    exportBtn,
  ]);

  const summary = h('section', { class: 'summary' });

  const dayBtn = h('button', { class: 'toggle-btn active', onclick: () => setMode('day') }, ['按天']);
  const weekBtn = h('button', { class: 'toggle-btn', onclick: () => setMode('week') }, ['按周']);
  const toggle = h('div', { class: 'toggle' }, [dayBtn, weekBtn]);

  const trendEl = h('div', { class: 'chart' });
  const feelingEl = h('div', { class: 'chart' });
  const bristolEl = h('div', { class: 'chart' });
  const hourEl = h('div', { class: 'chart' });

  const trendCard = h('section', { class: 'card' }, [
    h('div', { class: 'card-head' }, [h('h2', {}, ['次数趋势']), toggle]),
    trendEl,
  ]);
  const feelingCard = h('section', { class: 'card' }, [h('h2', {}, ['感受分布']), feelingEl]);
  const bristolCard = h('section', { class: 'card' }, [h('h2', {}, ['布里斯托分布']), bristolEl]);
  const hourCard = h('section', { class: 'card' }, [h('h2', {}, ['时段分布']), hourEl]);

  const chartsGrid = h('div', { class: 'charts-grid' }, [trendCard, feelingCard, bristolCard, hourCard]);

  const detail = h('section', { class: 'card detail' });

  const banner = totalCount() === 0
    ? h('div', { class: 'empty-banner' }, ['暂无数据 —— 去记录第一条吧（发给 botler：「上大号了」）'])
    : null;

  app.append(header, ...(banner ? [banner] : []), summary, chartsGrid, detail);

  renderSummary(summary);
  initCharts({ trend: trendEl, feeling: feelingEl, bristol: bristolEl, hour: hourEl });
  renderAll();
  initDetail(detail);

  // headless 导出模式（?export=1&view=share|dashboard）：渲染捕获目标供 export.mjs 截图
  const params = new URLSearchParams(location.search);
  if (params.get('export') === '1') {
    document.body.classList.add('export-mode');
    if ((params.get('view') ?? 'share') === 'share') {
      const capture = h('div', { class: 'capture' });
      document.body.append(capture);
      renderShareCardInto(capture);
    }
  }

  function setMode(m: 'day' | 'week'): void {
    setTrendMode(m);
    dayBtn.classList.toggle('active', m === 'day');
    weekBtn.classList.toggle('active', m === 'week');
    renderAll();
  }
}

main();
