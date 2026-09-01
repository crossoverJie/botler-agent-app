export type View =
  | 'summary'
  | 'all'
  | 'day'
  | 'category'
  | 'payer'
  | 'account'
  | 'trip'
  | 'payee'
  | 'insurance';

export type TypeFilter = 'all' | 'expense' | 'income' | 'refund';

export interface AppState {
  view: View;
  search: string;
  typeFilter: TypeFilter;
  /** 一键屏蔽金额(视觉脱敏,非加密)。 */
  masked: boolean;
}

type Listener = () => void;
const listeners: Listener[] = [];

const MASK_KEY = 'ledger.masked';

function loadMasked(): boolean {
  try {
    return localStorage.getItem(MASK_KEY) === '1';
  } catch {
    return false;
  }
}

export const state: AppState = {
  view: 'summary',
  search: '',
  typeFilter: 'all',
  masked: loadMasked(),
};

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  emit();
}

/** 切换金额屏蔽并持久化到 localStorage,刷新后保持。 */
export function setMasked(v: boolean): void {
  state.masked = v;
  try {
    localStorage.setItem(MASK_KEY, v ? '1' : '0');
  } catch {
    /* localStorage 不可用时静默降级为仅本次会话 */
  }
  emit();
}

export function subscribe(fn: Listener): void {
  listeners.push(fn);
}

function emit(): void {
  for (const l of listeners) l();
}
