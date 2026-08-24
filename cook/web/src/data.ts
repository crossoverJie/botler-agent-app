import intakeRaw from '@data/intake.json';
import configRaw from '@data/config.json';
import type { Config, DayRecord } from './types';

export const config = configRaw as unknown as Config;

const intake = intakeRaw as unknown as DayRecord[];

/** date string -> record, sorted source order preserved. */
export const records: Map<string, DayRecord> = new Map(
  intake.map((r) => [r.date, r as DayRecord]),
);

/** All records sorted ascending by date. */
export function sortedRecords(): DayRecord[] {
  return [...records.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Earliest / latest date present in the data (for default navigation). */
export function dataRange(): { min: string; max: string } | null {
  if (records.size === 0) return null;
  const all = sortedRecords();
  return { min: all[0].date, max: all[all.length - 1].date };
}
