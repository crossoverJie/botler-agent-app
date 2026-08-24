import type { Meal } from '../types';

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday as the first day of the week. */
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = (day + 6) % 7; // days since Monday
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -diff);
}

export function getWeekDates(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6x7 matrix of Dates covering the given month (with adjacent-month padding). */
export function getMonthMatrix(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  let cur = startOfWeek(first);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()));
      cur = addDays(cur, 1);
    }
    weeks.push(row);
  }
  return weeks;
}

export function isSameMonth(d: Date, year: number, month: number): boolean {
  return d.getFullYear() === year && d.getMonth() === month;
}

export function monthLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日'];
export function weekdayHeaders(): string[] {
  return WEEKDAY_CN;
}

/** "HH:MM" → 距零点分钟数；非该格式（如「上午」「睡前」或缺失）返回 null。 */
export function timeToMinutes(t?: string): number | null {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * 餐次排序：有精确时刻者按时间升序在前；无时刻/自由文本者按录入顺序排在后面。
 *
 * ⚠️ 依赖稳定排序：当双方都无时刻时返回 0（不交换），靠 ES2019+ 的 Array.sort
 * 稳定语义保住 JSON 录入顺序。现代浏览器 / Vite 目标满足；若以后有人把比较器改
 * 成不稳定实现（或对结果再 shuffle），无时刻餐次的相对顺序将不再可预期。
 */
export function byMealTime(
  a: [name: string, meal: Meal],
  b: [name: string, meal: Meal],
): number {
  const ma = timeToMinutes(a[1].time);
  const mb = timeToMinutes(b[1].time);
  if (ma == null && mb == null) return 0; // 均无 → 返回 0，依赖稳定排序保住录入顺序
  if (ma == null) return 1; // a 无时刻 → 靠后
  if (mb == null) return -1; // b 无时刻 → 靠后
  return ma - mb;
}
