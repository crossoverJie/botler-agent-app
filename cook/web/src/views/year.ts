import { config } from '../data';
import { setState, state } from '../state';
import { h } from '../utils/dom';
import { calColor } from '../utils/macros';
import { fmt, getMonthMatrix } from '../utils/date';

export function renderYear(): HTMLElement {
  const year = state.selectedDate.getFullYear();
  const wrap = h('div', { class: 'view year-view' });
  wrap.append(h('div', { class: 'view-title' }, [`${year} 年`]));
  wrap.append(h('div', { class: 'view-hint' }, ['颜色：蓝=摄入偏低，绿=达标区间，红=超目标 · 点击某月进入月视图']));

  const grid = h('div', { class: 'year-grid' });
  for (let m = 0; m < 12; m++) {
    const monthDate = new Date(year, m, 1);
    const matrix = getMonthMatrix(year, m);
    const mini = h('div', { class: 'mini-month', onclick: () => setState({ selectedDate: monthDate, view: 'month' }) }, [
      h('div', { class: 'mini-title' }, [`${m + 1}月`]),
    ]);
    const cells = h('div', { class: 'mini-grid' });
    for (const week of matrix) {
      for (const d of week) {
        const dateStr = fmt(d);
        const rec = state.records.get(dateStr) ?? null;
        const inMonth = d.getMonth() === m;
        const cell = h('span', {
          class: `mini-cell${inMonth ? '' : ' out'}`,
          title: rec ? `${dateStr} · ${Math.round(rec.calories)} kcal` : dateStr,
          style: rec ? `background:${calColor(rec.calories, config.tdee)}` : '',
        }, []);
        cells.append(cell);
      }
    }
    mini.append(cells);
    grid.append(mini);
  }
  wrap.append(grid);
  return wrap;
}
