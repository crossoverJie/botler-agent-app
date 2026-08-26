import poopRaw from '@data/poop.json';
import peeRaw from '@data/pee.json';
import type { PoopRecord, PeeRecord, PeeColor, PeeVolume, Bucket, BristolBucket } from './types';
export type { Bucket } from './types';
import { BRISTOLS, FEELINGS, PEE_FEELINGS, PEE_COLORS, PEE_VOLUMES, UNRECORDED_COLOR, UNRECORDED_LABEL } from './types';
import { toParts, fmtDate, daysAgoStr, todayStr, nowMs, pad } from './utils/date';

// ─────────────────────────── 通用规整工具 ───────────────────────────

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

function parseMs(s: string): number | null {
  const t = s.endsWith('Z') ? s.slice(0, -1) + '+00:00' : s;
  const ms = new Date(t).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export interface BaseRec {
  startedAt: string;
  feeling: string | null;
  note: string;
}

/** 兼容不同写入形态：规范是数组；部分工具会把单元素数组折叠成 {item:{...}}、把 null 写成字符串 "null"。 */
function flatten(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) return input.flatMap(flatten);
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    if (typeof o.startedAt === 'string') return [o];
    return Object.values(o).flatMap(flatten);
  }
  return [];
}

/** 把一条原始记录规整成 base 字段（startedAt/feeling/note），再并入数据集特有字段（extra）。startedAt 为空则跳过。 */
function buildRecord<T extends BaseRec>(
  o: Record<string, unknown>,
  feelingEnum: Set<string>,
  extra: (o: Record<string, unknown>) => Omit<T, keyof BaseRec>,
): T | null {
  const startedAt = normStr(o.startedAt);
  if (!startedAt) return null;

  const feeling = normNull(o.feeling);
  const note = normStr(o.note);

  const base: BaseRec = {
    startedAt,
    feeling: feeling != null && feelingEnum.has(feeling) ? feeling : null,
    note,
  };
  return { ...base, ...extra(o) } as T;
}

function normalizePoop(o: Record<string, unknown>): PoopRecord | null {
  // poop 特有：endedAt / durationSec（= endedAt-startedAt）/ bristol
  return buildRecord<PoopRecord>(o, FEELING_SET, (o) => {
    const endedAt = normNull(o.endedAt);
    let durationSec: number | null = null;
    if (endedAt) {
      const s = parseMs(normStr(o.startedAt));
      const e = parseMs(endedAt);
      if (s != null && e != null) {
        const d = (e - s) / 1000;
        if (d >= 0) durationSec = Math.round(d);
      }
    }
    const b = normNum(o.bristol);
    return {
      endedAt,
      durationSec,
      bristol: b != null && b >= 1 && b <= 7 ? b : null,
    };
  });
}

const PEE_FEELING_SET = new Set<string>(PEE_FEELINGS.map((f) => f.value));
const PEE_COLOR_SET = new Set<string>(PEE_COLORS.map((c) => c.value));
const PEE_VOLUME_SET = new Set<string>(PEE_VOLUMES.map((v) => v.value));

function normalizePee(o: Record<string, unknown>): PeeRecord | null {
  // pee 特有：volume（少/一般/多）/ color（无 endedAt / durationSec）
  return buildRecord<PeeRecord>(o, PEE_FEELING_SET, (o) => {
    const volRaw = normNull(o.volume);
    const volume: PeeVolume | null = volRaw != null && PEE_VOLUME_SET.has(volRaw) ? (volRaw as PeeVolume) : null;
    const colorRaw = normNull(o.color);
    const color: PeeColor | null = colorRaw != null && PEE_COLOR_SET.has(colorRaw) ? (colorRaw as PeeColor) : null;
    return { volume, color };
  });
}

const FEELING_SET = new Set<string>(FEELINGS.map((f) => f.value));

// ─────────────────────────── 数据集工厂 ───────────────────────────
// 一次产出整套通用统计 API；未来过滤（fmtDate <= todayStr）只在此处写一次，
// todayStr/nowMs 已支持 ?date= 锚定，故锚定逻辑天然对齐两个数据集。

export interface DatasetInstance<T extends BaseRec> {
  /** 截至「今天」（或 ?date= 锚定日）的记录，已按 startedAt 升序 */
  raw: T[];
  sortedRecords(): T[];
  totalCount(): number;
  countLastDays(n: number): number;
  latest(): T | null;
  feelingCounts(): Bucket[];
  hourCounts(): number[];
  trendDaily(days: number): { label: string; count: number }[];
  trendWeekly(weeks: number): { label: string; count: number }[];
}

function createDataset<T extends BaseRec>(
  rawObj: unknown,
  normalize: (o: Record<string, unknown>) => T | null,
  feelingEnum: readonly { value: string; label: string; color: string }[],
): DatasetInstance<T> {
  const rawRecords = (rawObj as { records?: unknown })?.records;
  // 只统计「截至今天（或 URL ?date= 锚定日）」的记录，历史快照时排除未来记录
  const records = flatten(rawRecords)
    .flatMap(normalize)
    .filter((r): r is T => r != null && fmtDate(r.startedAt) <= todayStr());

  return {
    raw: records,

    sortedRecords() {
      return [...records].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
    },

    totalCount() {
      return records.length;
    },

    /** 近 n 天（含今天）的次数 */
    countLastDays(n: number) {
      const cutoff = daysAgoStr(n - 1);
      return records.filter((r) => fmtDate(r.startedAt) >= cutoff).length;
    },

    latest() {
      const recs = this.sortedRecords();
      return recs.length ? recs[recs.length - 1] : null;
    },

    /** 感受分布（仅非零项 + 未记录），使用各数据集自己的枚举 */
    feelingCounts() {
      const map = new Map<string, number>();
      let unrecorded = 0;
      for (const r of records) {
        if (r.feeling) map.set(r.feeling, (map.get(r.feeling) ?? 0) + 1);
        else unrecorded += 1;
      }
      const out: Bucket[] = [];
      for (const f of feelingEnum) {
        const c = map.get(f.value) ?? 0;
        if (c > 0) out.push({ label: f.label, value: c, color: f.color });
      }
      if (unrecorded > 0) out.push({ label: UNRECORDED_LABEL, value: unrecorded, color: UNRECORDED_COLOR });
      return out;
    },

    /** 按小时分布（0-23） */
    hourCounts() {
      const arr = new Array(24).fill(0) as number[];
      for (const r of records) arr[toParts(r.startedAt).hh] += 1;
      return arr;
    },

    /** 近 days 天按天趋势，label 为 YYYY-MM-DD */
    trendDaily(days: number) {
      const byDate = new Map<string, number>();
      const cutoff = daysAgoStr(days - 1);
      for (const r of records) {
        const d = fmtDate(r.startedAt);
        if (d >= cutoff) byDate.set(d, (byDate.get(d) ?? 0) + 1);
      }
      const out: { label: string; count: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const key = daysAgoStr(i);
        out.push({ label: key, count: byDate.get(key) ?? 0 });
      }
      return out;
    },

    /** 近 weeks 周按周趋势（周一为起点），label 为 MM-DD */
    trendWeekly(weeks: number) {
      const p = toParts(nowMs());
      const dow = (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7; // 0=周一
      const thisMonday = new Date(Date.UTC(p.y, p.m - 1, p.d - dow));
      const out: { label: string; count: number }[] = [];
      for (let i = weeks - 1; i >= 0; i--) {
        const monday = new Date(thisMonday.getTime() - i * 7 * 86400000);
        const sunday = new Date(monday.getTime() + 6 * 86400000);
        const startKey = `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
        const endKey = `${sunday.getUTCFullYear()}-${pad(sunday.getUTCMonth() + 1)}-${pad(sunday.getUTCDate())}`;
        const count = records.filter((r) => {
          const d = fmtDate(r.startedAt);
          return d >= startKey && d <= endKey;
        }).length;
        out.push({ label: `${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`, count });
      }
      return out;
    },
  };
}

export const poop = createDataset<PoopRecord>(poopRaw, normalizePoop, FEELINGS);
export const pee = createDataset<PeeRecord>(peeRaw, normalizePee, PEE_FEELINGS);

// ─────────────────── 数据集特有聚合（字段不同，留在工厂外） ───────────────────

/** poop：布里斯托分布（固定 1-7 全量 + 未记录） */
export function poopBristolCounts(d: DatasetInstance<PoopRecord>): BristolBucket[] {
  const map = new Map<number, number>();
  let unrecorded = 0;
  for (const r of d.raw) {
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

/** poop：平均时长（秒），无有效数据返回 null */
export function poopAvgDurationSec(d: DatasetInstance<PoopRecord>): number | null {
  const ds: number[] = [];
  for (const r of d.raw) if (typeof r.durationSec === 'number') ds.push(r.durationSec);
  if (ds.length === 0) return null;
  return Math.round(ds.reduce((a, b) => a + b, 0) / ds.length);
}

/** poop：相邻记录的平均间隔（天），不足 2 条返回 null */
export function poopAvgIntervalDays(d: DatasetInstance<PoopRecord>): number | null {
  const recs = d.sortedRecords();
  if (recs.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < recs.length; i++) {
    sum += new Date(recs[i].startedAt).getTime() - new Date(recs[i - 1].startedAt).getTime();
  }
  return sum / (recs.length - 1) / 86400000;
}

/** pee：颜色分布（仅非零项 + 未记录） */
export function peeColorCounts(d: DatasetInstance<PeeRecord>): Bucket[] {
  const map = new Map<PeeColor, number>();
  let unrecorded = 0;
  for (const r of d.raw) {
    if (r.color) map.set(r.color, (map.get(r.color) ?? 0) + 1);
    else unrecorded += 1;
  }
  const out: Bucket[] = [];
  for (const c of PEE_COLORS) {
    const cnt = map.get(c.value) ?? 0;
    if (cnt > 0) out.push({ label: c.label, value: cnt, color: c.color });
  }
  if (unrecorded > 0) out.push({ label: UNRECORDED_LABEL, value: unrecorded, color: UNRECORDED_COLOR });
  return out;
}

/** pee：尿量分布（少/一般/多 + 未记录） */
export function peeVolumeCounts(d: DatasetInstance<PeeRecord>): Bucket[] {
  const map = new Map<PeeVolume, number>();
  let unrecorded = 0;
  for (const r of d.raw) {
    if (r.volume) map.set(r.volume, (map.get(r.volume) ?? 0) + 1);
    else unrecorded += 1;
  }
  const out: Bucket[] = [];
  for (const v of PEE_VOLUMES) {
    const cnt = map.get(v.value) ?? 0;
    if (cnt > 0) out.push({ label: v.label, value: cnt, color: v.color });
  }
  if (unrecorded > 0) out.push({ label: UNRECORDED_LABEL, value: unrecorded, color: UNRECORDED_COLOR });
  return out;
}
