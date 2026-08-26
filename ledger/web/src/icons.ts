// 内联 SVG 图标集(静态资源,绝不拼接用户输入)。
// 通过 h('span', { html: icon(...) }) 注入,内容固定、无 XSS 风险。

const wrap = (inner: string, cls = ''): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="16" height="16" fill="none" ` +
  `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export type IconName = 'income' | 'expense' | 'refund' | 'up' | 'down' | 'flat';

export function icon(name: IconName): string {
  switch (name) {
    case 'income': // 收入 ↑ 绿
      return wrap('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/>', 'ic-income');
    case 'expense': // 支出 ↓ 红
      return wrap('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/>', 'ic-expense');
    case 'refund': // 退款 ↺
      return wrap('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>', 'ic-refund');
    case 'up': // 环比上升(支出变多=坏,红)
      return wrap('<polyline points="18 15 12 9 6 15"/>', 'ic-up');
    case 'down': // 环比下降(支出变少=好,绿)
      return wrap('<polyline points="6 9 12 15 18 9"/>', 'ic-down');
    case 'flat':
      return wrap('<line x1="5" y1="12" x2="19" y2="12"/>', 'ic-flat');
  }
}
