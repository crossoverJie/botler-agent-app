import { records } from './data';
import type { DayRecord } from './types';

export type View = 'day' | 'week' | 'month' | 'year';

export interface AppState {
  view: View;
  selectedDate: Date;
  records: Map<string, DayRecord>;
}

type Listener = () => void;
const listeners: Listener[] = [];

export const state: AppState = {
  view: 'day',
  selectedDate: new Date(),
  records,
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
