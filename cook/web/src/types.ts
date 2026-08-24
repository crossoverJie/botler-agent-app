export interface Food {
  name: string;
  amount: string;
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  fiber: number;
}

export interface Meal {
  desc: string;
  foods: Food[];
  time?: string; // 可选：时段/说明（如「12:30」「上午」「睡前」），未指明时记记录当时的 HH:MM
}

export type Meals = Record<string, Meal>;

export interface Water {
  type: string; // 水类型（未指明时一律「矿泉水」）
  amount: number; // ml
  time?: string; // 可选：时段/说明（如「上午」「睡前」）
}

export interface DayRecord {
  date: string; // YYYY-MM-DD
  calories: number;
  protein: number;
  fat: number;
  carb: number;
  fiber: number;
  water?: number; // ml，饮水总量（= waters 各条 amount 之和）
  waters?: Water[]; // 饮水分次明细（可选）
  note?: string;
  meals: Meals;
}

export interface Targets {
  proteinPerKgMin: number;
  proteinPerKgMax: number;
  fatMin: number;
  fatMax: number;
  fiberMin: number;
  fiberMax: number;
  carbMin: number;
  carbMax: number;
  waterMin: number;
  waterMax: number;
  deficitMaxPct: number;
}

export interface RiceConfig {
  factor: number;
  ratio: number[];
  days: number;
  lunchCooked: number;
  dinnerCooked: number;
}

export interface Config {
  tdee: number;
  weightKg: number;
  targets: Targets;
  rice: RiceConfig;
}
