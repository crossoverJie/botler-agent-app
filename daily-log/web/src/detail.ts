import { h, mount } from './utils/dom';
import { sortedRecords } from './data';
import type { PoopRecord } from './types';
import { FEELINGS, BRISTOLS, FEELING_LABEL, FEELING_COLOR, BRISTOL_LABEL } from './types';
import { fmtDate, fmtDateTime, fmtDuration } from './utils/date';

interface Filters {
  from: string;
  to: string;
  feeling: string; // '' | Feeling | 'none'
  bristol: string; // '' | '1'-'7' | 'none'
  keyword: string;
}

function matches(r: PoopRecord, f: Filters): boolean {
  const d = fmtDate(r.startedAt);
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  if (f.feeling) {
    if (f.feeling === 'none') {
      if (r.feeling != null) return false;
    } else if (r.feeling !== f.feeling) return false;
  }
  if (f.bristol) {
    if (f.bristol === 'none') {
      if (r.bristol != null) return false;
    } else if (r.bristol !== Number(f.bristol)) return false;
  }
  if (f.keyword) {
    const note = (r.note ?? '').toLowerCase();
    if (!note.includes(f.keyword.toLowerCase())) return false;
  }
  return true;
}

export function initDetail(container: HTMLElement): void {
  const filters: Filters = { from: '', to: '', feeling: '', bristol: '', keyword: '' };

  const tbody = h('tbody');
  const table = h('table', { class: 'detail-table' }, [
    h('thead', {}, [
      h('tr', {}, ['开始时间', '结束时间', '时长', '感受', '布里斯托', '备注'].map((t) => h('th', {}, [t]))),
    ]),
    tbody,
  ]);
  const tableScroll = h('div', { class: 'table-scroll' }, [table]);

  const from = h('input', { type: 'date' });
  const to = h('input', { type: 'date' });
  const feeling = h('select', {}, [
    h('option', { value: '' }, ['全部感受']),
    ...FEELINGS.map((f) => h('option', { value: f.value }, [f.label])),
    h('option', { value: 'none' }, ['未记录']),
  ]);
  const bristol = h('select', {}, [
    h('option', { value: '' }, ['全部布里斯托']),
    ...BRISTOLS.map((b) => h('option', { value: String(b.value) }, [`${b.value} · ${b.label}`])),
    h('option', { value: 'none' }, ['未记录']),
  ]);
  const keyword = h('input', { type: 'text', placeholder: '搜索备注…' });

  from.addEventListener('change', () => {
    filters.from = from.value;
    renderRows();
  });
  to.addEventListener('change', () => {
    filters.to = to.value;
    renderRows();
  });
  feeling.addEventListener('change', () => {
    filters.feeling = feeling.value;
    renderRows();
  });
  bristol.addEventListener('change', () => {
    filters.bristol = bristol.value;
    renderRows();
  });
  keyword.addEventListener('input', () => {
    filters.keyword = keyword.value.trim();
    renderRows();
  });

  const filterBar = h('div', { class: 'detail-filters' }, [
    h('label', {}, ['日期']),
    from,
    h('span', {}, ['至']),
    to,
    feeling,
    bristol,
    keyword,
  ]);

  mount(container, h('h2', {}, ['明细']), filterBar, tableScroll);

  function renderRows(): void {
    const recs = sortedRecords()
      .slice()
      .reverse()
      .filter((r) => matches(r, filters));

    if (recs.length === 0) {
      mount(
        tbody,
        h('tr', { class: 'detail-empty' }, [h('td', { colspan: '6' }, ['暂无匹配记录'])]),
      );
      return;
    }

    mount(
      tbody,
      ...recs.map((r) => {
        const dotColor = r.feeling ? FEELING_COLOR[r.feeling] : '#cbd5e1';
        const feel = r.feeling ? FEELING_LABEL[r.feeling] : '—';
        const bristolText = r.bristol != null ? `${r.bristol} · ${BRISTOL_LABEL[r.bristol]}` : '—';
        return h('tr', {}, [
          h('td', {}, [fmtDateTime(r.startedAt)]),
          h('td', {}, [r.endedAt ? fmtDateTime(r.endedAt) : '—']),
          h('td', {}, [r.durationSec != null ? fmtDuration(r.durationSec) : '—']),
          h('td', {}, [
            h('span', { class: 'dot', style: `background:${dotColor}` }),
            feel,
          ]),
          h('td', {}, [bristolText]),
          h('td', { class: 'note' }, [r.note || '—']),
        ]);
      }),
    );
  }

  renderRows();
}
