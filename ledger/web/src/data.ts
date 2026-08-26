import ledgerRaw from '@data/ledger.json';
import type { LedgerRecord } from './types';

interface LedgerFile {
  version: number;
  currency: string;
  records: LedgerRecord[];
}

const file = ledgerRaw as unknown as LedgerFile;

/** All records, sorted ascending by (date, id). */
export const records: LedgerRecord[] = file.records
  .slice()
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** Fresh sorted copy (defensive). */
export function sortedRecords(): LedgerRecord[] {
  return [...records];
}
