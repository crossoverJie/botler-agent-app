import { toPng } from 'html-to-image';
import { h, mount } from './utils/dom';
import { totalCount, countLastDays, avgDurationSec, latest, feelingCounts, sortedRecords } from './data';
import type { PoopRecord } from './types';
import { FEELING_LABEL, FEELING_COLOR } from './types';
import { todayStr, fmtDate, fmtTime, fmtDuration, relativeLabel } from './utils/date';

function shareRow(r: PoopRecord): HTMLElement {
  const feelLabel = r.feeling ? FEELING_LABEL[r.feeling] : '—';
  const feelColor = r.feeling ? FEELING_COLOR[r.feeling] : '#cbd5e1';
  return h('div', { class: 'share-row' }, [
    h('span', { class: 'share-row-time' }, [`${fmtDate(r.startedAt).slice(5)} ${fmtTime(r.startedAt)}`]),
    h('span', { class: 'share-row-dot', style: `background:${feelColor}` }),
    h('span', { class: 'share-row-feel' }, [feelLabel]),
  ]);
}

function buildCard(): HTMLElement {
  const stats: { label: string; value: string }[] = [
    { label: '总次数', value: String(totalCount()) },
    { label: '近 7 天', value: String(countLastDays(7)) },
    { label: '平均时长', value: avgDurationSec() != null ? fmtDuration(avgDurationSec()!) : '—' },
    { label: '最近一次', value: latest() ? relativeLabel(latest()!.startedAt) : '—' },
  ];

  const feel = feelingCounts();
  const maxFeel = Math.max(1, ...feel.map((b) => b.value));
  const feelBars = feel.length
    ? feel.map((b) =>
        h('div', { class: 'share-bar' }, [
          h('div', { class: 'share-bar-top' }, [
            h('span', { class: 'share-bar-label' }, [b.label]),
            h('span', { class: 'share-bar-count' }, [String(b.value)]),
          ]),
          h('div', { class: 'share-bar-track' }, [
            h('div', {
              class: 'share-bar-fill',
              style: `width:${(b.value / maxFeel) * 100}%;background:${b.color}`,
            }),
          ]),
        ]),
      )
    : [h('div', { class: 'share-empty' }, ['暂无数据'])];

  const recent = sortedRecords().slice(-3).reverse();
  const recentList = recent.length
    ? recent.map((r) => shareRow(r))
    : [h('div', { class: 'share-empty' }, ['暂无记录'])];

  return h('div', { class: 'share-card' }, [
    h('div', { class: 'share-header' }, [
      h('div', { class: 'share-title' }, ['便便日志']),
      h('div', { class: 'share-sub' }, [`截至 ${todayStr()}`]),
    ]),
    h(
      'div',
      { class: 'share-stats' },
      stats.map((s) =>
        h('div', { class: 'share-stat' }, [
          h('div', { class: 'share-stat-label' }, [s.label]),
          h('div', { class: 'share-stat-value' }, [s.value]),
        ]),
      ),
    ),
    h('div', { class: 'share-section-title' }, ['感受分布']),
    ...feelBars,
    h('div', { class: 'share-section-title' }, ['最近记录']),
    ...recentList,
  ]);
}

/** 把分享卡片渲染进指定容器（headless 导出用）。 */
export function renderShareCardInto(container: HTMLElement): void {
  mount(container, buildCard());
}

/** 顶栏「导出图片」按钮：弹窗预览 + 下载 PNG（卡片在屏可见，html-to-image 才能正确截取）。 */
export function exportShareCard(): void {
  const card = buildCard();

  const overlay = h('div', { class: 'modal-overlay' });
  const downloadBtn = h('button', { class: 'modal-btn primary' }, ['下载 PNG']);

  const dialog = h('div', { class: 'modal-dialog' }, [
    h('div', { class: 'modal-title' }, [
      h('span', {}, ['导出图片']),
      h('button', { class: 'modal-close', title: '关闭', onclick: close }, ['×']),
    ]),
    h('div', { class: 'modal-body' }, [card]),
    h('div', { class: 'modal-footer' }, [
      downloadBtn,
      h('button', { class: 'modal-btn', onclick: close }, ['关闭']),
    ]),
  ]);

  overlay.append(dialog);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.append(overlay);

  downloadBtn.addEventListener('click', () => {
    void doDownload();
  });

  async function doDownload(): Promise<void> {
    downloadBtn.disabled = true;
    downloadBtn.textContent = '导出中…';
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(card, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `poop-${todayStr()}.png`;
      a.click();
      close();
    } catch (e) {
      console.error('导出失败', e);
      alert('导出失败，请查看控制台。');
      downloadBtn.disabled = false;
      downloadBtn.textContent = '下载 PNG';
    }
  }

  function close(): void {
    overlay.remove();
  }
}
