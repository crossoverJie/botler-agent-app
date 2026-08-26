import { toPng } from 'html-to-image';
import { h, mount } from './utils/dom';
import { poop, pee, poopAvgDurationSec, peeColorCounts, peeVolumeCounts } from './data';
import type { DatasetInstance, BaseRec } from './data';
import type { PoopRecord, PeeRecord } from './types';
import {
  FEELING_LABEL,
  FEELING_COLOR,
  PEE_FEELING_LABEL,
  PEE_FEELING_COLOR,
  UNRECORDED_COLOR,
} from './types';
import { todayStr, fmtDate, fmtTime, fmtDuration, relativeLabel } from './utils/date';

export interface ShareBarSection {
  title: string;
  bars: { label: string; value: number; color: string }[];
}

export interface ShareConfig {
  title: string;
  fileKey: string; // 'poop' | 'pee'，用于导出文件名
  dataset: DatasetInstance<BaseRec>;
  stats: { label: string; value: string }[];
  barSections: ShareBarSection[];
  recentRow: (r: unknown) => HTMLElement;
}

function buildCard(cfg: ShareConfig): HTMLElement {
  const stats = cfg.stats.map((s) =>
    h('div', { class: 'share-stat' }, [
      h('div', { class: 'share-stat-label' }, [s.label]),
      h('div', { class: 'share-stat-value' }, [s.value]),
    ]),
  );

  const sections = cfg.barSections.map((sec) => {
    const max = Math.max(1, ...sec.bars.map((b) => b.value));
    const bars = sec.bars.length
      ? sec.bars.map((b) =>
          h('div', { class: 'share-bar' }, [
            h('div', { class: 'share-bar-top' }, [
              h('span', { class: 'share-bar-label' }, [b.label]),
              h('span', { class: 'share-bar-count' }, [String(b.value)]),
            ]),
            h('div', { class: 'share-bar-track' }, [
              h('div', { class: 'share-bar-fill', style: `width:${(b.value / max) * 100}%;background:${b.color}` }),
            ]),
          ]),
        )
      : [h('div', { class: 'share-empty' }, ['暂无数据'])];
    return [h('div', { class: 'share-section-title' }, [sec.title]), ...bars];
  });

  const recs = cfg.dataset.sortedRecords().slice(-3).reverse();
  const recentList = recs.length
    ? recs.map((r) => cfg.recentRow(r))
    : [h('div', { class: 'share-empty' }, ['暂无记录'])];

  return h('div', { class: 'share-card' }, [
    h('div', { class: 'share-header' }, [
      h('div', { class: 'share-title' }, [cfg.title]),
      h('div', { class: 'share-sub' }, [`截至 ${todayStr()}`]),
    ]),
    h('div', { class: 'share-stats' }, stats),
    ...sections.flat(),
    h('div', { class: 'share-section-title' }, ['最近记录']),
    ...recentList,
  ]);
}

function poopRow(r: PoopRecord): HTMLElement {
  const feel = r.feeling ? FEELING_LABEL[r.feeling] : '—';
  const feelColor = r.feeling ? FEELING_COLOR[r.feeling] : UNRECORDED_COLOR;
  return h('div', { class: 'share-row' }, [
    h('span', { class: 'share-row-time' }, [`${fmtDate(r.startedAt).slice(5)} ${fmtTime(r.startedAt)}`]),
    h('span', { class: 'share-row-dot', style: `background:${feelColor}` }),
    h('span', { class: 'share-row-feel' }, [feel]),
  ]);
}

function peeRow(r: PeeRecord): HTMLElement {
  const feel = r.feeling ? PEE_FEELING_LABEL[r.feeling] : '—';
  const feelColor = r.feeling ? PEE_FEELING_COLOR[r.feeling] : UNRECORDED_COLOR;
  return h('div', { class: 'share-row' }, [
    h('span', { class: 'share-row-time' }, [`${fmtDate(r.startedAt).slice(5)} ${fmtTime(r.startedAt)}`]),
    h('span', { class: 'share-row-dot', style: `background:${feelColor}` }),
    h('span', { class: 'share-row-feel' }, [feel]),
  ]);
}

export function poopShareConfig(): ShareConfig {
  return {
    title: '便便日志',
    fileKey: 'poop',
    dataset: poop,
    stats: [
      { label: '总次数', value: String(poop.totalCount()) },
      { label: '近 7 天', value: String(poop.countLastDays(7)) },
      { label: '平均时长', value: poopAvgDurationSec(poop) != null ? fmtDuration(poopAvgDurationSec(poop)!) : '—' },
      { label: '最近一次', value: poop.latest() ? relativeLabel(poop.latest()!.startedAt) : '—' },
    ],
    barSections: [{ title: '感受分布', bars: poop.feelingCounts() }],
    recentRow: (r) => poopRow(r as PoopRecord),
  };
}

export function peeShareConfig(): ShareConfig {
  return {
    title: '小便日志',
    fileKey: 'pee',
    dataset: pee,
    stats: [
      { label: '总次数', value: String(pee.totalCount()) },
      { label: '近 7 天', value: String(pee.countLastDays(7)) },
      { label: '常见尿量', value: (() => {
        const vol = peeVolumeCounts(pee).filter((b) => b.label !== '未记录').sort((a, b) => b.value - a.value)[0];
        return vol ? vol.label : '—';
      })() },
      { label: '最近一次', value: pee.latest() ? relativeLabel(pee.latest()!.startedAt) : '—' },
    ],
    barSections: [
      { title: '感受分布', bars: pee.feelingCounts() },
      { title: '颜色分布', bars: peeColorCounts(pee).map((b) => ({ label: b.label, value: b.value, color: b.color })) },
      { title: '尿量分布', bars: peeVolumeCounts(pee).map((b) => ({ label: b.label, value: b.value, color: b.color })) },
    ],
    recentRow: (r) => peeRow(r as PeeRecord),
  };
}

/** 把分享卡片渲染进指定容器（headless 导出用）。 */
export function renderShareCardInto(container: HTMLElement, cfg: ShareConfig): void {
  mount(container, buildCard(cfg));
}

/** 顶栏「导出图片」按钮：弹窗预览 + 下载 PNG（卡片在屏可见，html-to-image 才能正确截取）。 */
export function exportShareCard(cfg: ShareConfig): void {
  const card = buildCard(cfg);

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
      a.download = `${cfg.fileKey}-${todayStr()}.png`;
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
