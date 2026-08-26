import type {
  Aggregates,
  CategoryNode,
  LedgerRecord,
  MonthlyRow,
  NamedAmount,
  Summary,
  TripRow,
} from '../types';

/** Round to 2 decimals — matches Python round(x, 2) closely enough for display + parity tolerance. */
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

function sumWhere(records: LedgerRecord[], type: LedgerRecord['type']): number {
  return records.reduce((s, r) => (r.type === type ? s + r.amount_cents : s), 0);
}

export function computeSummary(records: LedgerRecord[]): Summary {
  const totExp = sumWhere(records, 'expense');
  const totInc = sumWhere(records, 'income');
  const totRef = sumWhere(records, 'refund');
  const netExp = totExp - totRef;
  const balance = totInc - netExp;
  const savingsRate = totInc ? r2((balance / totInc) * 100) : null;
  return {
    totalIncome: totInc,
    netExpense: netExp,
    totalRefund: totRef,
    balance,
    savingsRate,
  };
}

export function computeMonthly(records: LedgerRecord[]): MonthlyRow[] {
  const monthly = new Map<string, { income: number; expense: number }>();
  for (const r of records) {
    const m = r.date.slice(0, 7);
    if (!monthly.has(m)) monthly.set(m, { income: 0, expense: 0 });
    const d = monthly.get(m)!;
    if (r.type === 'refund') d.expense -= r.amount_cents;
    else d[r.type] += r.amount_cents;
  }
  const months = [...monthly.keys()].sort();
  const rows: MonthlyRow[] = [];
  months.forEach((m, idx) => {
    const d = monthly.get(m)!;
    let momInc: number | null = null;
    let momExp: number | null = null;
    if (idx > 0) {
      const prev = monthly.get(months[idx - 1])!;
      if (prev.expense) momExp = r2(((d.expense - prev.expense) / prev.expense) * 100);
      if (prev.income) momInc = r2(((d.income - prev.income) / prev.income) * 100);
    }
    rows.push({
      month: m,
      income: d.income,
      expense: d.expense,
      balance: d.income - d.expense,
      momIncome: momInc,
      momExpense: momExp,
    });
  });
  return rows;
}

function rollup(records: LedgerRecord[], types: LedgerRecord['type'][]): CategoryNode[] {
  const netExp =
    sumWhere(records, 'expense') - sumWhere(records, 'refund');
  const topTot = new Map<string, number>();
  const subTot = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (!types.includes(r.type)) continue;
    const sign = r.type === 'expense' ? 1 : -1;
    const amt = r.amount_cents * sign;
    const path = r.category;
    topTot.set(path[0], (topTot.get(path[0]) ?? 0) + amt);
    if (path.length > 1) {
      if (!subTot.has(path[0])) subTot.set(path[0], new Map());
      const sub = subTot.get(path[0])!;
      sub.set(path[1], (sub.get(path[1]) ?? 0) + amt);
    }
  }
  const items: CategoryNode[] = [...topTot.entries()].map(([name, amount]) => {
    const subs = subTot.get(name);
    const children = subs
      ? [...subs.entries()].map(([cname, camt]) => ({ name: cname, amount: camt }))
      : [];
    children.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    return {
      name,
      amount,
      pct: netExp ? r2((amount / netExp) * 100) : 0,
      children,
    };
  });
  items.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return items;
}

export function computeCategories(records: LedgerRecord[]): CategoryNode[] {
  return rollup(records, ['expense', 'refund']);
}

export function computeIncomeCategories(records: LedgerRecord[]): CategoryNode[] {
  const totInc = sumWhere(records, 'income');
  const topTot = new Map<string, number>();
  const subTot = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (r.type !== 'income') continue;
    const path = r.category;
    topTot.set(path[0], (topTot.get(path[0]) ?? 0) + r.amount_cents);
    if (path.length > 1) {
      if (!subTot.has(path[0])) subTot.set(path[0], new Map());
      const sub = subTot.get(path[0])!;
      sub.set(path[1], (sub.get(path[1]) ?? 0) + r.amount_cents);
    }
  }
  const items: CategoryNode[] = [...topTot.entries()].map(([name, amount]) => {
    const subs = subTot.get(name);
    const children = subs
      ? [...subs.entries()].map(([cname, camt]) => ({ name: cname, amount: camt }))
      : [];
    children.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    return {
      name,
      amount,
      pct: totInc ? r2((amount / totInc) * 100) : 0,
      children,
    };
  });
  items.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return items;
}

function bySign(records: LedgerRecord[], keyOf: (r: LedgerRecord) => string): NamedAmount[] {
  const netExp = sumWhere(records, 'expense') - sumWhere(records, 'refund');
  const tot = new Map<string, number>();
  for (const r of records) {
    if (r.type === 'expense') tot.set(keyOf(r), (tot.get(keyOf(r)) ?? 0) + r.amount_cents);
    else if (r.type === 'refund') tot.set(keyOf(r), (tot.get(keyOf(r)) ?? 0) - r.amount_cents);
  }
  const rows: NamedAmount[] = [...tot.entries()].map(([name, amount]) => ({
    name,
    amount,
    pct: netExp ? r2((amount / netExp) * 100) : 0,
  }));
  rows.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return rows;
}

export function computeAccounts(records: LedgerRecord[]): NamedAmount[] {
  return bySign(records, (r) => r.account);
}

export function computePayers(records: LedgerRecord[]): NamedAmount[] {
  return bySign(records, (r) => r.payer ?? '我');
}

export function computeTrips(records: LedgerRecord[]): TripRow[] {
  const tripTot = new Map<string, number>();
  const tripDays = new Map<string, Set<string>>();
  const tripCats = new Map<string, Map<string, number>>();
  const tripPayers = new Map<string, Map<string, number>>();
  for (const r of records) {
    if (r.type !== 'expense' && r.type !== 'refund') continue;
    const sign = r.type === 'expense' ? 1 : -1;
    const amt = r.amount_cents * sign;
    for (const t of r.tags ?? []) {
      if (!t.startsWith('旅行:')) continue;
      const trip = t.slice(3);
      tripTot.set(trip, (tripTot.get(trip) ?? 0) + amt);
      if (r.type === 'expense') {
        if (!tripDays.has(trip)) tripDays.set(trip, new Set());
        tripDays.get(trip)!.add(r.date);
      }
      if (r.category && r.category.length) {
        if (!tripCats.has(trip)) tripCats.set(trip, new Map());
        const c = tripCats.get(trip)!;
        c.set(r.category[0], (c.get(r.category[0]) ?? 0) + amt);
      }
      const p = r.payer ?? '我';
      if (!tripPayers.has(trip)) tripPayers.set(trip, new Map());
      const tp = tripPayers.get(trip)!;
      tp.set(p, (tp.get(p) ?? 0) + amt);
    }
  }
  const rows: TripRow[] = [...tripTot.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([trip, total]) => {
      const days = tripDays.get(trip)?.size ?? 0;
      const avg = days ? r2(total / days) : 0;
      const cats = tripCats.get(trip);
      const categories = cats
        ? [...cats.entries()]
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
        : [];
      const tps = tripPayers.get(trip);
      const payers = tps
        ? [...tps.entries()]
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
        : [];
      return { trip, days, total, avg, categories, payers };
    });
  return rows;
}

export function computePayeeTop(records: LedgerRecord[], n = 10): NamedAmount[] {
  const tot = new Map<string, number>();
  for (const r of records) {
    if (r.type !== 'expense' && r.type !== 'refund') continue;
    if (!r.payee) continue;
    const sign = r.type === 'expense' ? 1 : -1;
    tot.set(r.payee, (tot.get(r.payee) ?? 0) + r.amount_cents * sign);
  }
  return [...tot.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function computeAggregates(records: LedgerRecord[]): Aggregates {
  return {
    empty: records.length === 0,
    summary: computeSummary(records),
    monthly: computeMonthly(records),
    categories: computeCategories(records),
    incomeCategories: computeIncomeCategories(records),
    accounts: computeAccounts(records),
    payers: computePayers(records),
    trips: computeTrips(records),
    payeeTop: computePayeeTop(records),
  };
}
