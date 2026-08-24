import { config } from '../data';
import { state } from '../state';
import { h } from '../utils/dom';
import { calColor } from '../utils/macros';
import { fmt, getWeekDates } from '../utils/date';
import { openDrawer } from '../components/drawer';

export function renderWeek(): HTMLElement {
  const days = getWeekDates(state.selectedDate);
  const todayStr = fmt(new Date());

  const wrap = h('div', { class: 'view week-view' });
  wrap.append(h('div', { class: 'view-title' }, ['本周']));
  wrap.append(h('div', { class: 'view-hint' }, ['点击某天查看当日明细']));

  const grid = h('div', { class: 'week-grid' });
  for (const d of days) {
    const dateStr = fmt(d);
    const rec = state.records.get(dateStr) ?? null;
    const isToday = dateStr === todayStr;
    const col = h('div', { class: `week-col${isToday ? ' today' : ''}${rec ? ' has-data' : ''}` }, [
      h('div', { class: 'week-date' }, [
        h('span', { class: 'wd' }, [['一', '二', '三', '四', '五', '六', '日'][d.getDay() === 0 ? 6 : d.getDay() - 1]]),
        h('span', { class: 'dnum' }, [String(d.getDate())]),
      ]),
    ]);
    if (rec) {
      for (const [name, meal] of Object.entries(rec.meals ?? {})) {
        col.append(
          h('div', { class: 'week-meal' }, [
            h('div', { class: 'wm-name' }, [name]),
            h('div', { class: 'wm-desc' }, [meal.desc || '—']),
          ]),
        );
      }
      col.append(
        h('div', { class: 'week-total' }, [
          h('span', { class: 'wt-kcal', style: `color:${calColor(rec.calories, config.tdee)}` }, [
            `${Math.round(rec.calories)}`,
          ]),
          h('span', { class: 'wt-unit' }, ['kcal']),
        ]),
      );
      col.addEventListener('click', () => openDrawer(dateStr));
    } else {
      col.append(h('div', { class: 'week-empty' }, ['—']));
    }
    grid.append(col);
  }
  wrap.append(grid);
  return wrap;
}
