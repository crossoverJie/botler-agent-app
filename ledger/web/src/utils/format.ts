export function money(cents: number): string {
  return '¥' + (cents / 100).toFixed(2);
}

/** Signed amount for net flows (refund shown as negative). */
export function signedMoney(cents: number): string {
  const s = (Math.abs(cents) / 100).toFixed(2);
  return (cents < 0 ? '−¥' : '¥') + s;
}

export function pct(v: number): string {
  return v.toFixed(1) + '%';
}

/** Compact money for axis labels (e.g. 1.2k). */
export function axisMoney(cents: number): string {
  const yuan = cents / 100;
  if (Math.abs(yuan) >= 10000) return (yuan / 10000).toFixed(1) + '万';
  if (Math.abs(yuan) >= 1000) return (yuan / 1000).toFixed(1) + 'k';
  return yuan.toFixed(0);
}

/** Escape for ECharts tooltip formatters (which render via innerHTML). */
export function escHTML(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}
