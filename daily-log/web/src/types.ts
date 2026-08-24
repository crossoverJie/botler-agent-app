export type Feeling =
  | 'normal'
  | 'constipated'
  | 'loose'
  | 'hard'
  | 'bloated'
  | 'abdominal_pain';

export interface PoopRecord {
  startedAt: string; // ISO 8601 +08:00
  endedAt: string | null;
  durationSec: number | null;
  feeling: Feeling | null;
  bristol: number | null; // 1-7
  note: string;
}

export interface PoopData {
  records: PoopRecord[];
}

export interface Bucket {
  label: string;
  value: number;
  color: string;
}

export interface BristolBucket {
  n: number | null; // 1-7，null = 未记录
  label: string;
  value: number;
  color: string;
}

export const UNRECORDED_COLOR = '#cbd5e1';
export const UNRECORDED_LABEL = '未记录';

export const FEELINGS: { value: Feeling; label: string; color: string }[] = [
  { value: 'normal', label: '正常', color: '#22c55e' },
  { value: 'constipated', label: '便秘', color: '#a1887f' },
  { value: 'loose', label: '拉稀', color: '#f59e0b' },
  { value: 'hard', label: '干硬', color: '#795548' },
  { value: 'bloated', label: '腹胀', color: '#8b5cf6' },
  { value: 'abdominal_pain', label: '腹痛', color: '#ef4444' },
];

export const FEELING_LABEL: Record<Feeling, string> = Object.fromEntries(
  FEELINGS.map((f) => [f.value, f.label]),
) as Record<Feeling, string>;

export const FEELING_COLOR: Record<Feeling, string> = Object.fromEntries(
  FEELINGS.map((f) => [f.value, f.color]),
) as Record<Feeling, string>;

export const BRISTOLS: { value: number; label: string; color: string }[] = [
  { value: 1, label: '硬块', color: '#8d6e63' },
  { value: 2, label: '干硬香肠', color: '#a1887f' },
  { value: 3, label: '裂痕香肠', color: '#bcaaa4' },
  { value: 4, label: '光滑柔软', color: '#66bb6a' },
  { value: 5, label: '软块', color: '#ffca28' },
  { value: 6, label: '糊状', color: '#ffa726' },
  { value: 7, label: '水样', color: '#ef5350' },
];

export const BRISTOL_LABEL: Record<number, string> = Object.fromEntries(
  BRISTOLS.map((b) => [b.value, b.label]),
);
