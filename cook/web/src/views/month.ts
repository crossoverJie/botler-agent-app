import { config } from '../data';
import { state } from '../state';
import type { DayRecord } from '../types';
import { h } from '../utils/dom';
import { calColor, macroSegments } from '../utils/macros';
import { fmt, getMonthMatrix, isSameMonth, monthLabel, weekdayHeaders } from '../utils/date';
import { openDrawer } from '../components/drawer';
import { setState } from '../state';

function miniBar(r: DayRecord): HTMLElement {
  const { p, f, c } = macroSegments(r);
  const seg = (w: number, color: string) =>
    h('span', { class: 'seg', style: `width:${(w * 100).toFixed(1)}%;background:${color}` }, []);
  return h('div', { class: 'mini-bar' }, [
    seg(p, '#6366f1'),
    seg(f, '#f59e0b'),
    seg(c, '#10b981'),
  ]);
}

function onCellClick(d: Date, inMonth: boolean): void {
  if (!inMonth) {
    setState({ selectedDate: d });
    return;
  }
  openDrawer(fmt(d));
}

export function renderMonth(): HTMLElement {
  const d = state.selectedDate;
  const year = d.getFullYear();
  const month = d.getMonth();
  const matrix = getMonthMatrix(year, month);

  const wrap = h('div', { class: 'view month-view' });
  wrap.append(h('div', { class: 'view-title' }, [`${monthLabel(d)}`]));
  wrap.append(h('div', { class: 'view-hint' }, ['点击日期查看当日明细 · 点击相邻月份日期跳转']));

  const grid = h('div', { class: 'month-grid' });
  for (const w of weekdayHeaders()) {
    grid.append(h('div', { class: 'wd' }, [w]));
  }

  const todayStr = fmt(new Date());
  for (const week of matrix) {
    for (const cellDate of week) {
      const dateStr = fmt(cellDate);
      const rec = state.records.get(dateStr) ?? null;
      const inMonth = isSameMonth(cellDate, year, month);
      const isToday = dateStr === todayStr;
      const cls = `cell${inMonth ? '' : ' muted'}${rec ? ' has-data' : ''}${isToday ? ' today' : ''}`;
      const cell = h('div', { class: cls, onclick: () => onCellClick(cellDate, inMonth) }, [
        h('div', { class: 'date-num' }, [String(cellDate.getDate())]),
      ]);
      if (rec) {
        cell.append(h('div', { class: 'kcal' }, [`${Math.round(rec.calories)}`]));
        cell.append(miniBar(rec));
        cell.append(
          h('span', { class: 'dot', style: `background:${calColor(rec.calories, config.tdee)}` }, []),
        );
      } else {
        cell.append(h('div', { class: 'kcal empty' }, ['—']));
      }
      grid.append(cell);
    }
  }
  wrap.append(grid);
  return wrap;
}
