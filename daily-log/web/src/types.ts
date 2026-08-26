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

// ─────────────────────────── 小便（pee） ───────────────────────────

export type PeeFeeling = 'normal' | 'urgent' | 'painful' | 'frequent' | 'foamy';

export type PeeColor = 'pale' | 'light' | 'deep' | 'cloudy' | 'blood';

// 尿量只记「多/少/一般」这类肉眼可判断的词，不记毫升数
export type PeeVolume = 'little' | 'normal' | 'much';

export interface PeeRecord {
  startedAt: string; // ISO 8601 +08:00（尿完那一刻记录即可，无需 endedAt / durationSec）
  feeling: PeeFeeling | null;
  volume: PeeVolume | null; // 尿量：少 / 一般 / 多，仅用户给出才填
  color: PeeColor | null; // 颜色枚举
  note: string;
}

export interface PeeData {
  records: PeeRecord[];
}

export const PEE_FEELINGS: { value: PeeFeeling; label: string; color: string }[] = [
  { value: 'normal', label: '正常', color: '#22c55e' },
  { value: 'urgent', label: '尿急', color: '#f59e0b' },
  { value: 'painful', label: '尿痛', color: '#ef4444' },
  { value: 'frequent', label: '尿频', color: '#3b82f6' },
  { value: 'foamy', label: '泡沫尿', color: '#8b5cf6' },
];

export const PEE_FEELING_LABEL: Record<PeeFeeling, string> = Object.fromEntries(
  PEE_FEELINGS.map((f) => [f.value, f.label]),
) as Record<PeeFeeling, string>;

export const PEE_FEELING_COLOR: Record<PeeFeeling, string> = Object.fromEntries(
  PEE_FEELINGS.map((f) => [f.value, f.color]),
) as Record<PeeFeeling, string>;

export const PEE_COLORS: { value: PeeColor; label: string; color: string }[] = [
  { value: 'pale', label: '无色', color: '#bae6fd' },
  { value: 'light', label: '浅黄', color: '#38bdf8' },
  { value: 'deep', label: '深黄', color: '#f59e0b' },
  { value: 'cloudy', label: '浑浊', color: '#94a3b8' },
  { value: 'blood', label: '血尿', color: '#ef4444' },
];

export const PEE_COLOR_LABEL: Record<PeeColor, string> = Object.fromEntries(
  PEE_COLORS.map((c) => [c.value, c.label]),
) as Record<PeeColor, string>;

export const PEE_VOLUMES: { value: PeeVolume; label: string; color: string }[] = [
  { value: 'little', label: '少', color: '#93c5fd' },
  { value: 'normal', label: '一般', color: '#4ade80' },
  { value: 'much', label: '多', color: '#fbbf24' },
];

export const PEE_VOLUME_LABEL: Record<PeeVolume, string> = Object.fromEntries(
  PEE_VOLUMES.map((v) => [v.value, v.label]),
) as Record<PeeVolume, string>;

export const PEE_VOLUME_COLOR: Record<PeeVolume, string> = Object.fromEntries(
  PEE_VOLUMES.map((v) => [v.value, v.color]),
) as Record<PeeVolume, string>;
