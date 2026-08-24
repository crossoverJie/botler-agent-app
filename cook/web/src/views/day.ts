import { config } from '../data';
import { state } from '../state';
import type { DayRecord, Meal } from '../types';
import { h } from '../utils/dom';
import { deficitPct, proteinPerKg, calorieWarn, deficitWarn, rangeWarn, waterWarn } from '../utils/macros';
import { fmt, byMealTime } from '../utils/date';

const MACRO_COLS = ['食物', '分量', '热量', '蛋白', '脂肪', '碳水', '纤维'];

function mealBlock(name: string, meal: Meal): HTMLElement {
  const foods = meal.foods ?? [];
  const sum = (k: keyof Meal['foods'][number]) =>
    foods.reduce((s, f) => s + (typeof f[k] === 'number' ? (f[k] as number) : 0), 0);
  const totals = {
    calories: sum('calories'),
    protein: sum('protein'),
    fat: sum('fat'),
    carb: sum('carb'),
    fiber: sum('fiber'),
  };

  const table = h('table', { class: 'food-table' });
  const thead = h(
    'tr',
    {},
    MACRO_COLS.map((c, i) => h('th', { class: i >= 2 ? 'num' : '' }, [c])),
  );
  table.append(thead);
  for (const f of foods) {
    table.append(
      h('tr', {}, [
        h('td', { class: 'fname' }, [f.name]),
        h('td', {}, [f.amount]),
        h('td', { class: 'num' }, [String(Math.round(f.calories))]),
        h('td', { class: 'num' }, [f.protein.toFixed(1)]),
        h('td', { class: 'num' }, [f.fat.toFixed(1)]),
        h('td', { class: 'num' }, [f.carb.toFixed(1)]),
        h('td', { class: 'num' }, [f.fiber.toFixed(1)]),
      ]),
    );
  }
  table.append(
    h('tr', { class: 'meal-total' }, [
      h('td', {}, ['小计']),
      h('td', {}, ['']),
      h('td', { class: 'num' }, [String(Math.round(totals.calories))]),
      h('td', { class: 'num' }, [totals.protein.toFixed(1)]),
      h('td', { class: 'num' }, [totals.fat.toFixed(1)]),
      h('td', { class: 'num' }, [totals.carb.toFixed(1)]),
      h('td', { class: 'num' }, [totals.fiber.toFixed(1)]),
    ]),
  );

  return h('div', { class: 'meal-block' }, [
    h('div', { class: 'meal-head' }, [
      h('span', { class: 'meal-name' }, [name]),
      meal.time ? h('span', { class: 'meal-time' }, [meal.time]) : document.createTextNode(''),
      meal.desc ? h('span', { class: 'meal-desc' }, [meal.desc]) : document.createTextNode(''),
    ]),
    table,
  ]);
}

function waterBlock(rec: DayRecord): HTMLElement {
  const waters = rec.waters ?? [];
  const table = h('table', { class: 'food-table' });
  table.append(
    h('tr', {}, [
      h('th', {}, ['时段']),
      h('th', {}, ['类型']),
      h('th', { class: 'num' }, ['分量(ml)']),
    ]),
  );
  for (const w of waters) {
    table.append(
      h('tr', {}, [
        h('td', {}, [w.time ?? '—']),
        h('td', {}, [w.type]),
        h('td', { class: 'num' }, [String(w.amount)]),
      ]),
    );
  }
  table.append(
    h('tr', { class: 'meal-total' }, [
      h('td', {}, ['合计']),
      h('td', {}, ['']),
      h('td', { class: 'num' }, [String(rec.water ?? 0)]),
    ]),
  );
  return h('div', { class: 'meal-block' }, [
    h('div', { class: 'meal-head' }, [h('span', { class: 'meal-name' }, ['饮水明细'])]),
    table,
  ]);
}

/** Full detail for a single day's record (also reused by the drawer). */
export function renderDayDetail(rec: DayRecord | null): HTMLElement {
  if (!rec) {
    return h('div', { class: 'day-empty' }, ['这一天没有摄入记录。']);
  }
  const cal = calorieWarn(rec.calories, config.tdee);
  const def = deficitWarn(deficitPct(rec.calories, config.tdee), config.targets.deficitMaxPct);
  const pro = rangeWarn(
    proteinPerKg(rec.protein, config.weightKg),
    config.targets.proteinPerKgMin,
    config.targets.proteinPerKgMax,
    '蛋白不足',
    '蛋白偏高',
  );
  const fatW = rangeWarn(
    rec.fat,
    config.targets.fatMin,
    config.targets.fatMax,
    '脂肪不足',
    '脂肪偏高',
  );
  const fibW = rangeWarn(
    rec.fiber,
    config.targets.fiberMin,
    config.targets.fiberMax,
    '纤维不足',
    '纤维偏高',
  );
  const carW = rangeWarn(
    rec.carb,
    config.targets.carbMin,
    config.targets.carbMax,
    '碳水不足',
    '碳水偏高',
  );
  const watW = waterWarn(rec.water, config.targets.waterMin, config.targets.waterMax);
  const header = h('div', { class: 'day-header' }, [
    h('div', { class: 'day-title' }, [
      h('span', { class: 'day-date' }, [rec.date]),
      rec.note ? h('span', { class: 'day-note' }, [rec.note]) : document.createTextNode(''),
    ]),
    h('div', { class: 'day-stats' }, [
      stat('热量', `${Math.round(rec.calories)} kcal`, cal.color, cal.hint),
      stat('缺口', `${deficitPct(rec.calories, config.tdee).toFixed(0)}%`, def.color, def.hint),
      stat(
        '蛋白',
        `${rec.protein.toFixed(1)} g（${proteinPerKg(rec.protein, config.weightKg).toFixed(2)} g/kg）`,
        pro.color,
        pro.hint,
      ),
      stat('碳水', `${rec.carb.toFixed(1)} g`, carW.color, carW.hint),
      stat('脂肪', `${rec.fat.toFixed(1)} g`, fatW.color, fatW.hint),
      stat('纤维', `${rec.fiber.toFixed(1)} g`, fibW.color, fibW.hint),
      stat('饮水', rec.water != null ? `${rec.water} ml` : '—', watW.color, watW.hint),
    ]),
  ]);

  const meals = Object.entries(rec.meals ?? {})
    .sort(byMealTime)
    .map(([name, meal]) => mealBlock(name, meal));
  const blocks: HTMLElement[] = [...meals];
  if ((rec.waters?.length ?? 0) > 0) {
    blocks.push(waterBlock(rec));
  }
  return h('div', { class: 'day-detail' }, [header, ...blocks]);
}

function stat(label: string, value: string, color?: string, hint?: string): HTMLElement {
  return h('div', { class: 'mini-stat' }, [
    h('span', { class: 'mini-label' }, [label]),
    h('span', { class: 'mini-value', style: color ? `color:${color}` : '' }, [value]),
    hint ? h('span', { class: 'mini-hint', style: color ? `color:${color}` : '' }, [hint]) : document.createTextNode(''),
  ]);
}

/** Day view: full detail for the currently selected date. */
export function renderDay(): HTMLElement {
  const dateStr = fmt(state.selectedDate);
  const rec = state.records.get(dateStr) ?? null;
  return h('div', { class: 'view day-view' }, [renderDayDetail(rec)]);
}
