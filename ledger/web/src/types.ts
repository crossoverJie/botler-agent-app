export type LedgerType = 'expense' | 'income' | 'refund';

export interface LedgerRecord {
  id: string;
  date: string; // YYYY-MM-DD
  type: LedgerType;
  amount_cents: number; // positive integer cents
  account: string;
  category: string[]; // [top, sub?]
  tags: string[];
  payer?: string;
  payee?: string | null;
  note?: string | null;
  created_at?: string;
}

export interface Summary {
  totalIncome: number;
  netExpense: number;
  totalRefund: number;
  balance: number;
  savingsRate: number | null;
}

export interface MonthlyRow {
  month: string;
  income: number;
  expense: number;
  balance: number;
  momIncome: number | null;
  momExpense: number | null;
}

export interface CategoryNode {
  name: string;
  amount: number;
  pct: number;
  children: { name: string; amount: number }[];
}

export interface NamedAmount {
  name: string;
  amount: number;
  pct?: number;
}

export interface TripRow {
  trip: string;
  days: number;
  total: number;
  avg: number;
  categories: { name: string; amount: number }[];
  payers: { name: string; amount: number }[];
}

export interface Aggregates {
  empty: boolean;
  summary: Summary;
  monthly: MonthlyRow[];
  categories: CategoryNode[];
  incomeCategories: CategoryNode[];
  accounts: NamedAmount[];
  payers: NamedAmount[];
  trips: TripRow[];
  payeeTop: NamedAmount[];
}
