import { records } from '../data';
import { h, mount } from '../utils/dom';
import { money } from '../utils/format';
import type { LedgerRecord } from '../types';

/** 保单维度的聚合结果(按 policy_no 去重,净已缴 = 支出 − 退款)。 */
interface Policy {
  policyNo: string;
  product: string;
  insurer: string;
  holder: string;
  insured: string;
  beneficiary: string;
  totalCents: number;
  installment: string;
  firstDate: string;
  lastDate: string;
}

const UNKNOWN_POLICY = '未登记保单号';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseInstallment(s: string): { n: number; m: number } | null {
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  return { n: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

function collectPolicies(): Policy[] {
  const ins = records.filter(
    (r: LedgerRecord) => (r.category?.[0] === '保险') && (r.type === 'expense' || r.type === 'refund'),
  );
  const map = new Map<string, Policy>();
  const order: string[] = [];
  for (const r of ins) {
    const d = r.details ?? {};
    const no = str(d.policy_no) || UNKNOWN_POLICY;
    if (!map.has(no)) {
      order.push(no);
      map.set(no, {
        policyNo: no,
        product: str(d.product),
        insurer: r.payee ?? '',
        holder: str(d.holder),
        insured: str(d.insured),
        beneficiary: str(d.beneficiary),
        totalCents: 0,
        installment: str(d.installment),
        firstDate: r.date,
        lastDate: r.date,
      });
    }
    const p = map.get(no)!;
    const sign = r.type === 'expense' ? 1 : -1;
    p.totalCents += r.amount_cents * sign;
    // 元数据取最新一条非空值(期数可能逐步递增)。
    if (str(d.product)) p.product = str(d.product);
    if (str(d.holder)) p.holder = str(d.holder);
    if (str(d.insured)) p.insured = str(d.insured);
    if (str(d.beneficiary)) p.beneficiary = str(d.beneficiary);
    if (str(d.installment)) p.installment = str(d.installment);
    if (r.payee) p.insurer = r.payee;
    if (r.date < p.firstDate) p.firstDate = r.date;
    if (r.date > p.lastDate) p.lastDate = r.date;
  }
  return order
    .map((no) => map.get(no)!)
    .sort((a, b) => b.totalCents - a.totalCents || a.policyNo.localeCompare(b.policyNo));
}

function kpi(label: string, value: string, sub?: string): HTMLElement {
  return h('div', { class: 'card kpi' }, [
    h('div', { class: 'card-label' }, [label]),
    h('div', { class: 'card-value' }, [value]),
    sub ? h('div', { class: 'card-sub' }, [sub]) : document.createTextNode(''),
  ]);
}

function metaRow(k: string, v: string): HTMLElement {
  return h('div', { class: 'policy-row' }, [
    h('span', { class: 'policy-k' }, [k]),
    h('span', { class: 'policy-v' }, [v]),
  ]);
}

function policyCard(p: Policy): HTMLElement {
  const pi = parseInstallment(p.installment);
  const progress = pi && pi.m > 0 ? Math.min(100, Math.round((pi.n / pi.m) * 100)) : null;
  const head = h('div', { class: 'policy-head' }, [
    h('div', { class: 'policy-title' }, [p.product || '未命名险种']),
    h('div', { class: 'policy-amt' }, [money(p.totalCents)]),
  ]);
  const meta = h('div', { class: 'policy-meta' }, [
    metaRow('承保公司', p.insurer || '—'),
    metaRow('保单号', p.policyNo === UNKNOWN_POLICY ? '—' : p.policyNo),
    metaRow('投保人', p.holder || '—'),
    metaRow('被保险人', p.insured || '—'),
    metaRow('受益人', p.beneficiary || '—'),
    metaRow('最近缴费', p.lastDate),
  ]);
  const progressEl =
    progress === null
      ? h('div', { class: 'policy-progress' }, [metaRow('缴费进度', p.installment || '—')])
      : h('div', { class: 'policy-progress' }, [
          h('div', { class: 'progress-info' }, [
            h('span', {}, ['缴费进度']),
            h('span', {}, [`${pi!.n}/${pi!.m} 期`]),
          ]),
          h('div', { class: 'progress-track' }, [
            h('div', { class: 'progress-fill', style: `width:${progress}%` }),
          ]),
        ]);
  return h('div', { class: 'policy-card' }, [head, meta, progressEl]);
}

function dimCard(title: string, rows: [string, number][]): HTMLElement {
  const table = h('table', { class: 'dim-table' });
  table.append(h('thead', {}, [h('tr', {}, [h('th', {}, ['维度']), h('th', {}, ['净保费'])])]));
  const tb = h('tbody');
  for (const [name, cents] of rows) {
    tb.append(h('tr', {}, [h('td', {}, [name]), h('td', { class: 'c-amt' }, [money(cents)])]));
  }
  table.append(tb);
  return h('div', { class: 'chart-card' }, [h('h3', {}, [title]), table]);
}

function renderDimensions(policies: Policy[]): HTMLElement {
  const by = (keyOf: (p: Policy) => string): [string, number][] => {
    const m = new Map<string, number>();
    for (const p of policies) {
      const k = keyOf(p) || '—';
      m.set(k, (m.get(k) ?? 0) + p.totalCents);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const grid = h('div', { class: 'charts-grid' });
  grid.append(
    dimCard('按险种', by((p) => p.product)),
    dimCard('按被保险人', by((p) => p.insured)),
    dimCard('按承保公司', by((p) => p.insurer)),
  );
  return grid;
}

export function renderInsurance(host: HTMLElement): void {
  const policies = collectPolicies();
  if (!policies.length) {
    mount(host, h('div', { class: 'empty' }, ['暂无保险记录']));
    return;
  }
  const totalCents = policies.reduce((s, p) => s + p.totalCents, 0);
  const insuredCount = new Set(policies.map((p) => p.insured).filter(Boolean)).size;
  const cards: HTMLElement[] = [
    kpi('保险净支出', money(totalCents), `${policies.length} 张保单`),
    kpi('保单数', String(policies.length), '按保单号去重'),
    kpi('保障对象', insuredCount ? String(insuredCount) : '—', '去重被保险人'),
  ];
  mount(
    host,
    h('div', { class: 'cards' }, cards),
    h('div', { class: 'policy-grid' }, policies.map(policyCard)),
    renderDimensions(policies),
  );
}
