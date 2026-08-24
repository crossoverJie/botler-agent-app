const TZ_OFFSET_MS = 8 * 3600 * 1000;

let nowOverrideMs: number | null = null;

// 支持 URL 参数 ?date=YYYY-MM-DD 或 ?asof=YYYY-MM-DD：把「现在」锚定到指定日期，
// 用于历史快照导出（如 headless export --date 2026-08-17）。
// 必须在模块加载早期执行，早于 data.ts 的顶层聚合计算。
(function initNowOverride(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('date') ?? params.get('asof');
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      if (!Number.isNaN(dt.getTime())) {
        nowOverrideMs = dt.getTime() - TZ_OFFSET_MS; // 该日 12:00 +08:00 的绝对时刻
      }
    }
  } catch {
    // 忽略（无 location / 参数非法）
  }
})();

export function nowMs(): number {
  return nowOverrideMs ?? Date.now();
}

export interface Parts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// 时间戳统一按 +08:00 墙钟解读（绝对时刻 +8h 后读 UTC 分量），与浏览器时区无关。
export function toParts(s: string | number | Date): Parts {
  const ms =
    typeof s === 'string' ? new Date(s).getTime() : s instanceof Date ? s.getTime() : s;
  const t = new Date(ms + TZ_OFFSET_MS);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    hh: t.getUTCHours(),
    mm: t.getUTCMinutes(),
    ss: t.getUTCSeconds(),
  };
}

export function fmtDate(s: string): string {
  const p = toParts(s);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function fmtTime(s: string): string {
  const p = toParts(s);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

export function fmtDateTime(s: string): string {
  return `${fmtDate(s)} ${fmtTime(s)}`;
}

export function todayStr(): string {
  const p = toParts(nowMs());
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

// n 天前的日期字符串（n=0 为今天）
export function daysAgoStr(n: number): string {
  const p = toParts(nowMs());
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d - n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function relativeLabel(s: string): string {
  const diffMs = nowMs() - new Date(s).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  return `${days} 天前`;
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} 秒`;
  if (s === 0) return `${m} 分钟`;
  return `${m} 分 ${s} 秒`;
}
