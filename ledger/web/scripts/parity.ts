/**
 * Parity guard: cross-check the TS aggregate (src/utils/aggregate.ts) against
 * the Python pipeline's `--aggregates-json` output. They must agree on every
 * metric (totals, savings rate, monthly trend incl. MoM, trip breakdown,
 * accounts, payers, payee Top) — those are the parts most prone to silent
 * drift. Run via `npm run parity` (tsx); exits non-zero on mismatch.
 *
 * Data is read from ../data/ledger.json with fs (no @data alias needed).
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAggregates } from '../src/utils/aggregate';
import type { LedgerRecord } from '../src/types';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '..', '..');
const ledgerPath = resolve(ROOT, 'data', 'ledger.json');
const buildPy = resolve(ROOT, 'scripts', 'build.py');

const raw = JSON.parse(readFileSync(ledgerPath, 'utf-8')) as { records: LedgerRecord[] };
const tsAgg = computeAggregates(raw.records);

const pyRaw = execFileSync('python3', [buildPy, '--aggregates-json'], { cwd: ROOT }).toString();
const pyAgg = JSON.parse(pyRaw);

const TOL = 1e-6;
const mismatches: string[] = [];

function walk(a: unknown, b: unknown, path: string): void {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Math.abs(a - b) > TOL) mismatches.push(`${path}: ${a} != ${b}`);
    return;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) mismatches.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
    return;
  }
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) mismatches.push(`${path}: key count ${ka.length} != ${kb.length}`);
  for (const k of new Set([...ka, ...kb])) {
    walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
  }
}

walk(tsAgg, pyAgg, '$');

if (mismatches.length) {
  console.error('❌ 聚合对账不一致:');
  for (const m of mismatches.slice(0, 50)) console.error('  ' + m);
  if (mismatches.length > 50) console.error(`  …(${mismatches.length - 50} more)`);
  process.exit(1);
} else {
  console.log('✅ TS 聚合与 Python --aggregates-json 逐项一致');
}
