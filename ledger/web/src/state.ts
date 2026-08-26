export type View =
  | 'summary'
  | 'all'
  | 'day'
  | 'category'
  | 'payer'
  | 'account'
  | 'trip'
  | 'payee';

export type TypeFilter = 'all' | 'expense' | 'income' | 'refund';

export interface AppState {
  view: View;
  search: string;
  typeFilter: TypeFilter;
}

type Listener = () => void;
const listeners: Listener[] = [];

export const state: AppState = {
  view: 'summary',
  search: '',
  typeFilter: 'all',
};

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  emit();
}

export function subscribe(fn: Listener): void {
  listeners.push(fn);
}

function emit(): void {
  for (const l of listeners) l();
}
