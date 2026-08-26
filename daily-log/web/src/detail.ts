import { h, mount } from './utils/dom';
import type { DatasetInstance, BaseRec } from './data';
import {
  FEELINGS,
  BRISTOLS,
  FEELING_LABEL,
  FEELING_COLOR,
  BRISTOL_LABEL,
  PEE_FEELINGS,
  PEE_COLORS,
  PEE_FEELING_LABEL,
  PEE_FEELING_COLOR,
  PEE_COLOR_LABEL,
  PEE_VOLUMES,
  PEE_VOLUME_LABEL,
  PEE_VOLUME_COLOR,
  UNRECORDED_COLOR,
} from './types';
import type { PeeVolume } from './types';
import { fmtDate, fmtDateTime, fmtDuration } from './utils/date';

export interface DetailColumn {
  title: string;
  render: (r: unknown) => HTMLElement;
}

export interface DetailFilter {
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  noneLabel?: string;
  /** value 为 '' 表示不过滤；'none' 表示「未记录」；否则为具体枚举值 */
  match: (r: unknown, value: string) => boolean;
}

const dot = (color: string): HTMLElement => h('span', { class: 'dot', style: `background:${color}` });
const tdText = (t: string): HTMLElement => h('td', {}, [t]);

function matchesAll(r: unknown, filters: DetailFilter[], active: string[]): boolean {
  const d = fmtDate((r as { startedAt: string }).startedAt);
  for (let i = 0; i < filters.length; i++) {
    const v = active[i];
    if (!v) continue;
    if (filters[i].match(r, v) === false) return false;
  }
  void d;
  return true;
}

/** 通用明细表：列与过滤项由 spec 提供；poop / pee 各自一套，渲染逻辑只写一遍。 */
export function initDetail(
  container: HTMLElement,
  dataset: DatasetInstance<BaseRec>,
  columns: DetailColumn[],
  filters: DetailFilter[],
): void {
  const active = filters.map(() => '');

  const tbody = h('tbody');
  const table = h('table', { class: 'detail-table' }, [
    h('thead', {}, [h('tr', {}, columns.map((c) => h('th', {}, [c.title])))]),
    tbody,
  ]);
  const tableScroll = h('div', { class: 'table-scroll' }, [table]);

  const selects = filters.map((f, i) => {
    const sel = h(
      'select',
      {},
      [
        h('option', { value: '' }, [f.allLabel]),
        ...f.options.map((o) => h('option', { value: o.value }, [o.label])),
        ...(f.noneLabel ? [h('option', { value: 'none' }, [f.noneLabel])] : []),
      ],
    );
    sel.addEventListener('change', () => {
      active[i] = (sel as HTMLSelectElement).value;
      renderRows();
    });
    return sel;
  });

  const keyword = h('input', { type: 'text', placeholder: '搜索备注…' });
  keyword.addEventListener('input', () => {
    renderRows();
  });

  const filterBar = h(
    'div',
    { class: 'detail-filters' },
    [h('label', {}, ['筛选']), ...selects.flatMap((s) => [s]), keyword],
  );

  mount(container, h('h2', {}, ['明细']), filterBar, tableScroll);

  function renderRows(): void {
    const kw = (keyword as HTMLInputElement).value.trim().toLowerCase();
    const recs = dataset
      .sortedRecords()
      .slice()
      .reverse()
      .filter((r) => matchesAll(r, filters, active))
      .filter((r) => {
        if (!kw) return true;
        const note = ((r as { note?: string }).note ?? '').toLowerCase();
        return note.includes(kw);
      });

    if (recs.length === 0) {
      mount(tbody, h('tr', { class: 'detail-empty' }, [h('td', { colspan: String(columns.length) }, ['暂无匹配记录'])]));
      return;
    }

    mount(tbody, ...recs.map((r) => h('tr', {}, columns.map((c) => c.render(r)))));
  }

  renderRows();
}

// ─────────────────────────── poop 明细配置 ───────────────────────────

export const POOP_DETAIL = {
  columns: [
    { title: '开始时间', render: (r: unknown) => tdText(fmtDateTime((r as { startedAt: string }).startedAt)) },
    { title: '结束时间', render: (r: unknown) => tdText((r as { endedAt: string | null }).endedAt ? fmtDateTime((r as { endedAt: string }).endedAt) : '—') },
    { title: '时长', render: (r: unknown) => tdText((r as { durationSec: number | null }).durationSec != null ? fmtDuration((r as { durationSec: number }).durationSec) : '—') },
    {
      title: '感受',
      render: (r: unknown) => {
        const rr = r as { feeling: keyof typeof FEELING_LABEL | null };
        return h('td', {}, [dot(rr.feeling ? FEELING_COLOR[rr.feeling] : UNRECORDED_COLOR), rr.feeling ? FEELING_LABEL[rr.feeling] : '—']);
      },
    },
    {
      title: '布里斯托',
      render: (r: unknown) => {
        const rr = r as { bristol: number | null };
        return tdText(rr.bristol != null ? `${rr.bristol} · ${BRISTOL_LABEL[rr.bristol]}` : '—');
      },
    },
    { title: '备注', render: (r: unknown) => h('td', { class: 'note' }, [(r as { note: string }).note || '—']) },
  ] as DetailColumn[],
  filters: [
    {
      label: '感受',
      allLabel: '全部感受',
      options: FEELINGS.map((f) => ({ value: f.value, label: f.label })),
      noneLabel: '未记录',
      match: (r: unknown, v: string) => (v === 'none' ? (r as { feeling: unknown }).feeling == null : (r as { feeling: unknown }).feeling === v),
    },
    {
      label: '布里斯托',
      allLabel: '全部布里斯托',
      options: BRISTOLS.map((b) => ({ value: String(b.value), label: `${b.value} · ${b.label}` })),
      noneLabel: '未记录',
      match: (r: unknown, v: string) => (v === 'none' ? (r as { bristol: unknown }).bristol == null : (r as { bristol: unknown }).bristol === Number(v)),
    },
  ] as DetailFilter[],
};

// ─────────────────────────── pee 明细配置 ───────────────────────────

export const PEE_DETAIL = {
  columns: [
    { title: '开始时间', render: (r: unknown) => tdText(fmtDateTime((r as { startedAt: string }).startedAt)) },
    {
      title: '尿量',
      render: (r: unknown) => {
        const rr = r as { volume: PeeVolume | null };
        const label = rr.volume ? PEE_VOLUME_LABEL[rr.volume] : '—';
        const color = rr.volume ? PEE_VOLUME_COLOR[rr.volume] : UNRECORDED_COLOR;
        return h('td', {}, [dot(color), label]);
      },
    },
    {
      title: '感受',
      render: (r: unknown) => {
        const rr = r as { feeling: keyof typeof PEE_FEELING_LABEL | null };
        return h('td', {}, [dot(rr.feeling ? PEE_FEELING_COLOR[rr.feeling] : UNRECORDED_COLOR), rr.feeling ? PEE_FEELING_LABEL[rr.feeling] : '—']);
      },
    },
    {
      title: '颜色',
      render: (r: unknown) => {
        const rr = r as { color: keyof typeof PEE_COLOR_LABEL | null };
        const c = rr.color ? PEE_COLORS.find((x) => x.value === rr.color) : undefined;
        return h('td', {}, [dot(c ? c.color : UNRECORDED_COLOR), rr.color ? PEE_COLOR_LABEL[rr.color] : '—']);
      },
    },
    { title: '备注', render: (r: unknown) => h('td', { class: 'note' }, [(r as { note: string }).note || '—']) },
  ] as DetailColumn[],
  filters: [
    {
      label: '感受',
      allLabel: '全部感受',
      options: PEE_FEELINGS.map((f) => ({ value: f.value, label: f.label })),
      noneLabel: '未记录',
      match: (r: unknown, v: string) => (v === 'none' ? (r as { feeling: unknown }).feeling == null : (r as { feeling: unknown }).feeling === v),
    },
    {
      label: '颜色',
      allLabel: '全部颜色',
      options: PEE_COLORS.map((c) => ({ value: c.value, label: c.label })),
      noneLabel: '未记录',
      match: (r: unknown, v: string) => (v === 'none' ? (r as { color: unknown }).color == null : (r as { color: unknown }).color === v),
    },
    {
      label: '尿量',
      allLabel: '全部尿量',
      options: PEE_VOLUMES.map((v) => ({ value: v.value, label: v.label })),
      noneLabel: '未记录',
      match: (r: unknown, v: string) => (v === 'none' ? (r as { volume: unknown }).volume == null : (r as { volume: unknown }).volume === v),
    },
  ] as DetailFilter[],
};
