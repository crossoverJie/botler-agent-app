import { records as ALL } from '../data';
import { state, type View, type TypeFilter } from '../state';
import { h, clear } from '../utils/dom';
import { money } from '../utils/format';
import { openDrawer } from './drawer';
import type { LedgerRecord } from '../types';

const TYPEMAP: Record<string, string> = { expense: '支', income: '收', refund: '退' };
const LABEL: Record<string, string> = {
  date: '日期', type: '类型', category: '分类', payer: '付款人', account: '账户', payee: '交易对象', amount: '金额', note: '备注·标签',
};
const COLS: Record<string, string[]> = {
  all: ['date', 'type', 'category', 'payer', 'account', 'payee', 'amount', 'note'],
  day: ['type', 'category', 'payer', 'account', 'payee', 'amount', 'note'],
  category: ['date', 'type', 'payer', 'account', 'payee', 'amount', 'note'],
  payer: ['date', 'type', 'category', 'account', 'payee', 'amount', 'note'],
  account: ['date', 'type', 'category', 'payer', 'payee', 'amount', 'note'],
  trip: ['date', 'type', 'category', 'payer', 'account', 'payee', 'amount', 'note'],
  payee: ['date', 'type', 'category', 'payer', 'account', 'amount', 'note'],
};
const TYPES: Record<string, string[]> = {
  all: ['expense', 'income', 'refund'],
  day: ['expense', 'refund'], category: ['expense', 'refund'], payer: ['expense', 'refund'],
  account: ['expense', 'refund'], trip: ['expense', 'refund'], payee: ['expense', 'refund'],
};
const GROUPLABEL: Record<string, string> = { day: '', category: '分类', payer: '付款人', account: '账户', trip: '行程', payee: '交易对象' };

let sortCol = 'date';
let sortDir: 'asc' | 'desc' = 'desc';

function cell(col: string, r: LedgerRecord): HTMLElement {
  switch (col) {
    case 'date':
      return h('td', {}, [r.date]);
    case 'type':
      return h('td', { class: `c-type t-${r.type}` }, [TYPEMAP[r.type]]);
    case 'category':
      return h('td', {}, [(r.category || []).join(' / ')]);
    case 'payer': {
      const p = r.payer || '我';
      return h('td', {}, [p !== '我' ? '@' + p : p]);
    }
    case 'account':
      return h('td', {}, [r.account]);
    case 'payee':
      return h('td', {}, [r.payee || '—']);
    case 'amount': {
      const txt = (r.type === 'refund' ? '−' : '') + money(r.amount_cents) + (r.type === 'refund' ? ' (退)' : '');
      return h('td', { class: `num c-amt t-${r.type}` }, [txt]);
    }
    case 'note': {
      const tags = (r.tags || []).map((t) => '#' + t).join(' ');
      const txt = [r.note || '', tags].filter(Boolean).join('  ');
      return h('td', { class: 'c-note' }, [txt || '—']);
    }
  }
  return h('td', {}, ['']);
}

function sortRecords(recs: LedgerRecord[]): LedgerRecord[] {
  const dir = sortDir === 'asc' ? 1 : -1;
  const col = sortCol;
  return recs.slice().sort((a, b) => {
    let cmp: number;
    if (col === 'amount') cmp = a.amount_cents - b.amount_cents;
    else cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return cmp * dir;
  });
}

function buildTable(view: string, rows: LedgerRecord[]): HTMLElement {
  const cols = COLS[view];
  const table = h('table', { class: 'dt' });
  const tr = h('tr');
  cols.forEach((c) => {
    if (c === 'date' || c === 'amount') {
      const active = sortCol === c;
      const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      tr.append(
        h('th', { class: 'sortable' + (active ? ' active' : ''), onclick: () => toggleSort(c) }, [LABEL[c] + arrow]),
      );
    } else {
      tr.append(h('th', {}, [LABEL[c]]));
    }
  });
  table.append(h('thead', {}, [tr]));
  const tb = h('tbody');
  rows.forEach((r) =>
    tb.append(h('tr', { class: 'row-clickable', onclick: () => openDrawer(r) }, cols.map((c) => cell(c, r)))),
  );
  table.append(tb);
  return table;
}

function groupKey(view: string, r: LedgerRecord): string {
  switch (view) {
    case 'day':
      return r.date;
    case 'category':
      return (r.category || []).join(' / ');
    case 'payer':
      return r.payer || '我';
    case 'account':
      return r.account;
    case 'trip': {
      const t = (r.tags || []).find((x) => x.startsWith('旅行:'));
      return t ? t.slice(3) : '未归类';
    }
    case 'payee':
      return r.payee || '无';
  }
  return '其他';
}

function groupHeader(view: string, g: { k: string; rs: LedgerRecord[]; net: number }): HTMLElement {
  const titleText = (GROUPLABEL[view] ? GROUPLABEL[view] + ' ' : '') + g.k;
  const subs: string[] = [];
  if (view === 'trip') {
    const days = new Set(g.rs.filter((r) => r.type === 'expense').map((r) => r.date)).size;
    const avg = days ? g.net / days : 0;
    const payerTot: Record<string, number> = {};
    g.rs.forEach((r) => {
      const s = r.type === 'refund' ? -1 : 1;
      const pk = r.payer || '我';
      payerTot[pk] = (payerTot[pk] || 0) + r.amount_cents * s;
    });
    const ps = Object.keys(payerTot)
      .sort((a, b) => payerTot[b] - payerTot[a])
      .map((p) => p + ' ' + money(payerTot[p]))
      .join('、');
    subs.push('总花费 ' + money(g.net));
    subs.push(days + ' 天');
    subs.push('日均 ' + money(avg));
    subs.push('按付款人: ' + ps);
  } else {
    subs.push('净支出 ' + money(g.net));
  }
  subs.push(g.rs.length + ' 笔');
  return h('div', { class: 'grp-head' }, [
    h('span', { class: 'grp-title' }, [titleText]),
    h('span', { class: 'grp-sub' }, [subs.join(' · ')]),
  ]);
}

function renderGrouped(view: string, recs: LedgerRecord[]): HTMLElement {
  const map: Record<string, LedgerRecord[]> = {};
  recs.forEach((r) => {
    const k = groupKey(view, r);
    (map[k] = map[k] || []).push(r);
  });
  const gs = Object.keys(map).map((k) => {
    const rs = map[k];
    let exp = 0;
    let ref = 0;
    rs.forEach((r) => {
      if (r.type === 'expense') exp += r.amount_cents;
      else if (r.type === 'refund') ref += r.amount_cents;
    });
    return { k, rs, exp, ref, net: exp - ref };
  });
  if (view === 'day') gs.sort((a, b) => b.k.localeCompare(a.k));
  else gs.sort((a, b) => b.net - a.net);

  const frag = document.createDocumentFragment();
  gs.forEach((g) => {
    const sec = h('div', { class: 'grp' });
    sec.append(groupHeader(view, g));
    sec.append(buildTable(view, sortRecords(g.rs)));
    frag.append(sec);
  });
  return frag as unknown as HTMLElement;
}

function renderAll(recs: LedgerRecord[]): HTMLElement {
  const wrap = document.createDocumentFragment();
  wrap.append(buildTable('all', sortRecords(recs)));
  let inc = 0;
  let exp = 0;
  let ref = 0;
  recs.forEach((r) => {
    if (r.type === 'income') inc += r.amount_cents;
    else if (r.type === 'expense') exp += r.amount_cents;
    else ref += r.amount_cents;
  });
  const net = inc - exp + ref;
  const totals = h('div', { class: 'totals' });
  const add = (label: string, val: string) =>
    totals.append(h('div', { class: 'tot' }, [h('div', { class: 'tot-label' }, [label]), h('div', { class: 'tot-value' }, [val])]));
  add('收入合计', money(inc));
  add('支出合计', money(exp));
  add('退款合计', money(ref));
  add('净额(结余)', money(net));
  wrap.append(totals);
  return wrap as unknown as HTMLElement;
}

function applyFilter(): LedgerRecord[] {
  const view = state.view;
  const cfgTypes = TYPES[view] || ['expense', 'income', 'refund'];
  let recs = ALL.filter((r) => cfgTypes.indexOf(r.type) >= 0);
  if (state.typeFilter !== 'all') {
    if (cfgTypes.indexOf(state.typeFilter) >= 0) recs = recs.filter((r) => r.type === state.typeFilter);
    else recs = [];
  }
  const q = state.search.trim().toLowerCase();
  if (q) {
    recs = recs.filter((r) => {
      const hay = [r.note, r.payee, (r.category || []).join(' '), (r.tags || []).join(' ')]
        .map((x) => (x || '').toLowerCase())
        .join(' ');
      return hay.indexOf(q) >= 0;
    });
  }
  return recs;
}

export function toggleSort(c: string): void {
  if (sortCol === c) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else {
    sortCol = c;
    sortDir = 'desc';
  }
  const host = document.getElementById('detail');
  if (host) renderDetail(host);
}

export function renderDetail(host: HTMLElement): void {
  clear(host);
  const recs = applyFilter();
  if (!recs.length) {
    host.append(h('div', { class: 'empty' }, ['无匹配记录']));
    return;
  }
  if (state.view === 'all') host.append(renderAll(recs));
  else host.append(renderGrouped(state.view, recs));
}

export type { View, TypeFilter };
