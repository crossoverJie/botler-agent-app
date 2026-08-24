import raw from '@data/poop.json';
import type { PoopRecord, Feeling, Bucket, BristolBucket } from './types';
import { BRISTOLS, FEELINGS, UNRECORDED_COLOR, UNRECORDED_LABEL } from './types';
import { toParts, fmtDate, daysAgoStr, pad, todayStr, nowMs } from './utils/date';

const FEELING_VALUES = new Set<string>(FEELINGS.map((f) => f.value));

function normStr(v: unknown): string {
  if (typeof v === 'string') return v;
  return v == null ? '' : String(v);
}

// null 归一：null / "null" / "" 统一为 null，其余返回原字符串
function normNull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = typeof v === 'string' ? v.trim() : String(v);
  if (s === '' || s.toLowerCase() === 'null') return null;
  return s;
}

function normNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || t.toLowerCase() === 'null') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normFeeling(v: unknown): Feeling | null {
  const s = normNull(v);
  if (s == null) return null;
  return FEELING_VALUES.has(s) ? (s as Feeling) : null;
}

function normalizeRecord(o: Record<string, unknown>): PoopRecord | null {
  const startedAt = normStr(o.startedAt);
  if (!startedAt) return null;
  const bristol = normNum(o.bristol);
  return {
    startedAt,
    endedAt: normNull(o.endedAt),
    durationSec: normNum(o.durationSec),
    feeling: normFeeling(o.feeling),
    bristol: bristol != null && bristol >= 1 && bristol <= 7 ? bristol : null,
    note: normStr(o.note),
  };
}

// 兼容不同写入形态：规范是数组；部分工具会把单元素数组折叠成 {item:{...}}、把 null 写成字符串 "null"。
// 统一规整成干净的 PoopRecord[]，保证任何形态下页面都能正确展示。
function normalizeRecords(input: unknown): PoopRecord[] {
  if (Array.isArray(input)) return input.flatMap(normalizeRecords);
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.startedAt === 'string') {
      const r = normalizeRecord(obj);
      return r ? [r] : [];
    }
    return Object.values(obj).flatMap(normalizeRecords);
  }
  return [];
}

const rawObj = raw as { records?: unknown };
// 只统计「截至今天（或 URL ?date= 锚定日）」的记录，历史快照时排除未来记录
const data: { records: PoopRecord[] } = {
  records: normalizeRecords(rawObj.records).filter((r) => fmtDate(r.startedAt) <= todayStr()),
};

/** 按 startedAt 升序 */
export function sortedRecords(): PoopRecord[] {
  return [...data.records].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

export function totalCount(): number {
  return data.records.length;
}

/** 近 n 天（含今天）的次数 */
export function countLastDays(n: number): number {
  const cutoff = daysAgoStr(n - 1);
  return data.records.filter((r) => fmtDate(r.startedAt) >= cutoff).length;
}

/** 平均时长（秒），无有效数据返回 null */
export function avgDurationSec(): number | null {
  const ds: number[] = [];
  for (const r of data.records) if (typeof r.durationSec === 'number') ds.push(r.durationSec);
  if (ds.length === 0) return null;
  return Math.round(ds.reduce((a, b) => a + b, 0) / ds.length);
}

/** 相邻记录的平均间隔（天），不足 2 条返回 null */
export function avgIntervalDays(): number | null {
  const recs = sortedRecords();
  if (recs.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < recs.length; i++) {
    sum += new Date(recs[i].startedAt).getTime() - new Date(recs[i - 1].startedAt).getTime();
  }
  return sum / (recs.length - 1) / 86400000;
}

export function latest(): PoopRecord | null {
  const recs = sortedRecords();
  return recs.length ? recs[recs.length - 1] : null;
}

/** 感受分布（仅非零项 + 未记录） */
export function feelingCounts(): Bucket[] {
  const map = new Map<Feeling, number>();
  let unrecorded = 0;
  for (const r of data.records) {
    if (r.feeling) map.set(r.feeling, (map.get(r.feeling) ?? 0) + 1);
    else unrecorded += 1;
  }
  const out: Bucket[] = [];
  for (const f of FEELINGS) {
    const c = map.get(f.value) ?? 0;
    if (c > 0) out.push({ label: f.label, value: c, color: f.color });
  }
  if (unrecorded > 0) out.push({ label: UNRECORDED_LABEL, value: unrecorded, color: UNRECORDED_COLOR });
  return out;
}

/** 布里斯托分布（固定 1-7 全量 + 未记录） */
export function bristolCounts(): BristolBucket[] {
  const map = new Map<number, number>();
  let unrecorded = 0;
  for (const r of data.records) {
    const b = r.bristol;
    if (typeof b === 'number' && b >= 1 && b <= 7) map.set(b, (map.get(b) ?? 0) + 1);
    else unrecorded += 1;
  }
  const out: BristolBucket[] = BRISTOLS.map((b) => ({
    n: b.value,
    label: b.label,
    value: map.get(b.value) ?? 0,
    color: b.color,
  }));
  if (unrecorded > 0) out.push({ n: null, label: UNRECORDED_LABEL, value: unrecorded, color: UNRECORDED_COLOR });
  return out;
}

/** 按小时分布（0-23） */
export function hourCounts(): number[] {
  const arr = new Array(24).fill(0) as number[];
  for (const r of data.records) arr[toParts(r.startedAt).hh] += 1;
  return arr;
}

/** 近 days 天按天趋势，label 为 YYYY-MM-DD */
export function trendDaily(days: number): { label: string; count: number }[] {
  const byDate = new Map<string, number>();
  const cutoff = daysAgoStr(days - 1);
  for (const r of data.records) {
    const d = fmtDate(r.startedAt);
    if (d >= cutoff) byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  const out: { label: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = daysAgoStr(i);
    out.push({ label: key, count: byDate.get(key) ?? 0 });
  }
  return out;
}

/** 近 weeks 周按周趋势（周一为起点），label 为 MM-DD */
export function trendWeekly(weeks: number): { label: string; count: number }[] {
  const p = toParts(nowMs());
  const dow = (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7; // 0=周一
  const thisMonday = new Date(Date.UTC(p.y, p.m - 1, p.d - dow));
  const out: { label: string; count: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(thisMonday.getTime() - i * 7 * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    const startKey = `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
    const endKey = `${sunday.getUTCFullYear()}-${pad(sunday.getUTCMonth() + 1)}-${pad(sunday.getUTCDate())}`;
    const count = data.records.filter((r) => {
      const d = fmtDate(r.startedAt);
      return d >= startKey && d <= endKey;
    }).length;
    out.push({ label: `${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`, count });
  }
  return out;
}
