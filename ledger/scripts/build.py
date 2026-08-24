#!/usr/bin/env python3
"""Ledger builder + validator (per-day source of truth).

Source of truth: data/days/YYYY-MM-DD.json (one file per day). build.py merges
all day files into the aggregate data/ledger.json, validates every record against
data/meta.json (category tree / accounts / trip-tag registry), and emits a
self-contained static dashboard to web/ledger.html (Python stdlib only).

For queries, use --report: it prints a text summary so the agent does NOT need
to read raw data files (bounded tokens regardless of ledger size).

Usage:
    python3 scripts/build.py                  # merge + validate + refresh dashboard + aggregate
    python3 scripts/build.py --dry-run        # merge + validate only, no writes
    python3 scripts/build.py --report 本月    # text report: this month income/expense/balance
    python3 scripts/build.py --report 旅行:2026北京
    python3 scripts/build.py --report 分类:交通
    python3 scripts/build.py --report 最近5
    python3 scripts/build.py --report 总览
    python3 scripts/build.py --report 付款人:女友      # 某付款人全部支出
    python3 scripts/build.py --report 付款人           # 按付款人拆分全部支出
"""
import argparse
import glob
import html
import json
import os
import sys
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAYS_DIR = os.path.join(ROOT, "data", "days")
LEDGER = os.path.join(ROOT, "data", "ledger.json")
META = os.path.join(ROOT, "data", "meta.json")
OUT = os.path.join(ROOT, "web", "ledger.html")

BIG_AMOUNT_CENTS = 1000000  # single expense > ¥10000 => warning (possible extra zero)
CURRENCY = "CNY"


def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg):
    print(f"WARN: {msg}", file=sys.stderr)


def read_json(path, required=True):
    if not os.path.exists(path):
        if required:
            fail(f"找不到文件:{path}")
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        fail(f"{path} 不是合法 JSON:{e}")


def merge_days():
    """读取 data/days/*.json 合并为记录数组(只读)。

    文件名必须是 日期.json 且与内部 date 字段一致(防漂移);任何一天文件损坏都硬失败,
    拒绝在坏数据上生成聚合。
    """
    files = sorted(glob.glob(os.path.join(DAYS_DIR, "*.json")))
    records = []
    if not files:
        warn("data/days/ 为空——聚合将置空(新项目首次运行属正常;若是有历史数据被清空,请用 git 恢复)。")
        return records
    for path in files:
        d = read_json(path)
        if not isinstance(d, dict) or "date" not in d or "records" not in d:
            fail(f"{os.path.basename(path)} 应为 {{ date, records }} 结构。")
        if not isinstance(d["records"], list):
            fail(f"{os.path.basename(path)} 的 records 应为数组。")
        if os.path.basename(path) != f"{d['date']}.json":
            fail(f"{os.path.basename(path)} 的文件名与其内部 date({d['date']}) 不一致。")
        records.extend(d["records"])
    return records


def load_meta():
    meta = read_json(META)
    if not isinstance(meta, dict) or not all(k in meta for k in ("categories", "accounts", "tags")):
        fail("meta.json 缺少 categories / accounts / tags 键。")
    # payers 是可选维度:缺省视为只有「我」,老数据(无 payers 键)仍可通过校验。
    meta.setdefault("payers", ["我"])
    return meta


def category_exists(path, meta):
    """分类路径必须逐级存在于 meta.json.categories(最多两级)。"""
    if not isinstance(path, list) or not path:
        return False
    for top in meta["categories"]:
        if top.get("name") != path[0]:
            continue
        if len(path) == 1:
            return True
        return len(path) == 2 and path[1] in top.get("children", [])
    return False


def validate(records, meta):
    seen_ids = set()
    for i, r in enumerate(records):
        where = f"第 {i} 条记录"
        if not isinstance(r, dict):
            fail(f"{where}应为对象。")
        rid = r.get("id")
        if not isinstance(rid, str) or not rid:
            fail(f"{where}({r})缺少字符串 id。")
        if rid in seen_ids:
            fail(f"id 重复:{rid}")
        seen_ids.add(rid)

        amt = r.get("amount_cents")
        if not isinstance(amt, int) or isinstance(amt, bool) or amt <= 0:
            fail(f"{rid}:amount_cents 应为正整数分,实际为 {amt!r}(元→分应 ×100)。")

        if r.get("type") not in ("expense", "income"):
            fail(f"{rid}:type 应为 expense / income。")

        if not isinstance(r.get("date"), str) or len(r.get("date", "")) != 10:
            fail(f"{rid}:date 应为 YYYY-MM-DD。")
        try:
            date.fromisoformat(r["date"])
        except ValueError:
            fail(f"{rid}:date 非法日期 {r['date']!r}。")

        if r.get("account") not in meta["accounts"]:
            fail(f"{rid}:account {r.get('account')!r} 不在 meta.json.accounts 中。")

        # payer 维度:缺省视为「我」;若显式填写则必须在 meta.json.payers 中(防止发明新付款人)。
        payer = r.get("payer", "我")
        if payer not in meta.get("payers", ["我"]):
            fail(f"{rid}:payer {payer!r} 不在 meta.json.payers 中。")

        if not category_exists(r.get("category"), meta):
            fail(f"{rid}:分类 {r.get('category')!r} 不在 meta.json.categories 中(严格)。")

        tags = r.get("tags") or []
        if not isinstance(tags, list):
            fail(f"{rid}:tags 应为数组。")
        for t in tags:
            if not isinstance(t, str) or not t:
                fail(f"{rid}:tags 元素应为非空字符串。")
            # 只对 旅行: 前缀做格式校验(设计要求);其余为通用多维标签,静默接受。
            if t.startswith("旅行:") and not t[3:].strip():
                fail(f"{rid}:旅行标签缺少行程名,应为 旅行:<行程名>。")

        if amt > BIG_AMOUNT_CENTS and r.get("type") == "expense":
            warn(f"{rid}:单笔 {amt / 100:.2f} 元超过 ¥10000,请确认未多写一个零。")

    return seen_ids


def write_aggregate(records, dry_run=False):
    """幂等写回 data/ledger.json(聚合产物,唯一真相源是 data/days/)。语义一致则跳过。"""
    records = sorted(records, key=lambda r: (r.get("date", ""), r.get("id", "")))
    content = json.dumps(
        {"version": 1, "currency": CURRENCY, "records": records}, ensure_ascii=False, indent=2
    ) + "\n"
    if os.path.exists(LEDGER):
        try:
            with open(LEDGER, encoding="utf-8") as f:
                if json.load(f).get("records") == records:
                    return  # 无变化,避免噪音 git diff
        except json.JSONDecodeError:
            pass  # 聚合损坏时强制重写
    if dry_run:
        print(f"[dry-run] 将写入 {LEDGER}")
        return
    with open(LEDGER, "w", encoding="utf-8") as f:
        f.write(content)


def fmt(cents):
    return f"{cents / 100:.2f}"


def esc(s):
    return html.escape(str(s), quote=False)


# ---------------------------------------------------------------- dashboard


def render(records):
    expenses = [r for r in records if r["type"] == "expense"]
    incomes = [r for r in records if r["type"] == "income"]
    tot_exp = sum(r["amount_cents"] for r in expenses)
    tot_inc = sum(r["amount_cents"] for r in incomes)
    balance = tot_inc - tot_exp
    savings_rate = (balance / tot_inc * 100) if tot_inc else None

    # --- 月度趋势 ---
    monthly = defaultdict(lambda: {"income": 0, "expense": 0})
    for r in records:
        m = r["date"][:7]
        monthly[m][r["type"]] += r["amount_cents"]
    months = sorted(monthly)
    monthly_rows = []
    for idx, m in enumerate(months):
        d = monthly[m]
        exp = d["expense"]
        inc = d["income"]
        mom_exp = mom_inc = None
        if idx > 0:
            prev = monthly[months[idx - 1]]
            if prev["expense"]:
                mom_exp = (exp - prev["expense"]) / prev["expense"] * 100
            if prev["income"]:
                mom_inc = (inc - prev["income"]) / prev["income"] * 100
        monthly_rows.append((m, inc, exp, inc - exp, mom_inc, mom_exp))

    # --- 分类汇总(逐级 roll up)---
    top_tot = defaultdict(int)
    sub_tot = defaultdict(lambda: defaultdict(int))
    for r in expenses:
        path = r["category"]
        top_tot[path[0]] += r["amount_cents"]
        if len(path) > 1:
            sub_tot[path[0]][path[1]] += r["amount_cents"]

    # --- 收入分类 ---
    inc_top = defaultdict(int)
    inc_sub = defaultdict(lambda: defaultdict(int))
    for r in incomes:
        path = r["category"]
        inc_top[path[0]] += r["amount_cents"]
        if len(path) > 1:
            inc_sub[path[0]][path[1]] += r["amount_cents"]

    # --- 标签/行程汇总 ---
    trip_rows = []
    trip_days = defaultdict(set)
    trip_cats = defaultdict(lambda: defaultdict(int))
    trip_tot = defaultdict(int)
    for r in expenses:
        for t in (r.get("tags") or []):
            if not t.startswith("旅行:"):
                continue
            trip = t[3:]  # strip the "旅行:" prefix (3 chars)
            trip_tot[trip] += r["amount_cents"]
            trip_days[trip].add(r["date"])
            if r["category"]:
                trip_cats[trip][r["category"][0]] += r["amount_cents"]
    for trip in sorted(trip_tot, key=lambda k: -trip_tot[k]):
        days = len(trip_days[trip])
        avg = trip_tot[trip] / days if days else 0
        cats = "、".join(f"{c} {fmt(v)}" for c, v in sorted(trip_cats[trip].items(), key=lambda kv: -kv[1]))
        payer_tot = defaultdict(int)
        for r in expenses:
            if f"旅行:{trip}" in (r.get("tags") or []):
                payer_tot[r.get("payer", "我")] += r["amount_cents"]
        payers = "、".join(f"{p} {fmt(v)}" for p, v in sorted(payer_tot.items(), key=lambda kv: -kv[1]))
        trip_rows.append((trip, days, avg, cats, payers))

    # --- 账户 ---
    acc_tot = defaultdict(int)
    for r in expenses:
        acc_tot[r["account"]] += r["amount_cents"]

    # --- 付款人 ---
    payer_tot = defaultdict(int)
    for r in expenses:
        payer_tot[r.get("payer", "我")] += r["amount_cents"]

    # --- 交易对象 Top-N ---
    payee_tot = defaultdict(int)
    for r in expenses:
        if r.get("payee"):
            payee_tot[r["payee"]] += r["amount_cents"]
    payee_top = sorted(payee_tot.items(), key=lambda kv: -kv[1])[:10]

    # --- HTML ---
    def card(label, value, sub=""):
        sub_html = f'<div class="card-sub">{esc(sub)}</div>' if sub else ""
        return (
            f'<div class="card"><div class="card-label">{esc(label)}</div>'
            f'<div class="card-value">¥{esc(value)}</div>'
            f"{sub_html}</div>"
        )

    parts = [
        "<!DOCTYPE html>",
        '<html lang="zh-CN"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>记账仪表盘</title><style>",
        "body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;margin:0;background:#f5f6f8;color:#222}",
        "header{padding:18px 24px;background:#fff;border-bottom:1px solid #e3e5e8}",
        "h1{font-size:20px;margin:0}h1 small{color:#888;font-weight:normal}",
        "main{padding:20px 24px;max-width:1100px;margin:0 auto}",
        ".cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}",
        ".card{background:#fff;border-radius:10px;padding:14px 18px;min-width:150px;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
        ".card-label{color:#888;font-size:12px}.card-value{font-size:22px;font-weight:600;margin-top:4px}",
        ".card-sub{color:#999;font-size:12px;margin-top:2px}",
        "h2{font-size:16px;margin:26px 0 10px}",
        "table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
        "th,td{padding:9px 12px;text-align:right;font-size:13px;border-bottom:1px solid #f0f1f3}",
        "th:first-child,td:first-child{text-align:left}",
        "th{background:#fafbfc;color:#555;font-weight:500}",
        ".empty{padding:40px;text-align:center;color:#999;background:#fff;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
        ".up{color:#e0563a}.down{color:#2a9d5f}",
        "</style></head><body>",
        "<header><h1>记账仪表盘 <small>single source of truth: data/days/</small></h1></header><main>",
    ]

    if not records:
        parts.append('<div class="empty">暂无流水记录。消费消息路由到本项目后,记录将出现在 data/days/。</div>')
        parts.append("</main></body></html>")
        return "\n".join(parts)

    parts.append('<div class="cards">')
    parts.append(card("总收入", fmt(tot_inc)))
    parts.append(card("总支出", fmt(tot_exp)))
    parts.append(card("结余", fmt(balance), "收入 − 支出"))
    if savings_rate is not None:
        parts.append(card("储蓄率", f"{savings_rate:.1f}%", "结余 / 收入"))
    parts.append("</div>")

    # 月度
    parts.append("<h2>月度收支趋势</h2><table><tr><th>月份</th><th>收入</th><th>收入环比</th><th>支出</th><th>支出环比</th><th>结余</th></tr>")
    for m, inc, exp, bal, mom_inc, mom_exp in monthly_rows:
        def pct_cell(mom):
            if mom is None:
                return "—"
            cls = "up" if mom > 0 else ("down" if mom < 0 else "")
            return f'<span class="{cls}">{mom:+.1f}%</span>'
        parts.append(
            f"<tr><td>{esc(m)}</td><td>{fmt(inc)}</td><td>{pct_cell(mom_inc)}</td>"
            f"<td>{fmt(exp)}</td><td>{pct_cell(mom_exp)}</td><td>{fmt(bal)}</td></tr>"
        )
    parts.append("</table>")

    # 分类(支出)
    parts.append("<h2>分类汇总(支出)</h2><table><tr><th>一级分类</th><th>金额</th><th>占比</th><th>二级明细</th></tr>")
    for top, amt in sorted(top_tot.items(), key=lambda kv: -kv[1]):
        pct = amt / tot_exp * 100 if tot_exp else 0
        subs = "、".join(f"{c} {fmt(v)}" for c, v in sorted(sub_tot[top].items(), key=lambda kv: -kv[1]))
        parts.append(f"<tr><td>{esc(top)}</td><td>{fmt(amt)}</td><td>{pct:.1f}%</td><td>{esc(subs)}</td></tr>")
    parts.append("</table>")

    # 分类(收入)
    if inc_top:
        parts.append("<h2>收入分类</h2><table><tr><th>一级分类</th><th>金额</th><th>占比</th><th>二级明细</th></tr>")
        for top, amt in sorted(inc_top.items(), key=lambda kv: -kv[1]):
            pct = amt / tot_inc * 100 if tot_inc else 0
            subs = "、".join(f"{c} {fmt(v)}" for c, v in sorted(inc_sub[top].items(), key=lambda kv: -kv[1]))
            parts.append(f"<tr><td>{esc(top)}</td><td>{fmt(amt)}</td><td>{pct:.1f}%</td><td>{esc(subs)}</td></tr>")
        parts.append("</table>")

    # 标签/行程
    if trip_rows:
        parts.append("<h2>行程汇总(按 旅行: 标签)</h2><table><tr><th>行程</th><th>天数</th><th>总花费</th><th>日均</th><th>分类明细</th><th>按付款人</th></tr>")
        for trip, days, avg, cats, payers in trip_rows:
            parts.append(f"<tr><td>{esc(trip)}</td><td>{days}</td><td>{fmt(trip_tot[trip])}</td><td>{fmt(avg)}</td><td>{esc(cats)}</td><td>{esc(payers)}</td></tr>")
        parts.append("</table>")

    # 账户
    parts.append("<h2>账户支出占比</h2><table><tr><th>账户</th><th>支出</th><th>占比</th></tr>")
    for acc, amt in sorted(acc_tot.items(), key=lambda kv: -kv[1]):
        pct = amt / tot_exp * 100 if tot_exp else 0
        parts.append(f"<tr><td>{esc(acc)}</td><td>{fmt(amt)}</td><td>{pct:.1f}%</td></tr>")
    parts.append("</table>")

    # 付款人(仅当存在多人付款时才展示,单人时不占版面)
    if len(payer_tot) > 1:
        parts.append("<h2>付款人支出占比</h2><table><tr><th>付款人</th><th>支出</th><th>占比</th></tr>")
        for p, amt in sorted(payer_tot.items(), key=lambda kv: -kv[1]):
            pct = amt / tot_exp * 100 if tot_exp else 0
            parts.append(f"<tr><td>{esc(p)}</td><td>{fmt(amt)}</td><td>{pct:.1f}%</td></tr>")
        parts.append("</table>")

    # 交易对象
    if payee_top:
        parts.append("<h2>交易对象 Top-10</h2><table><tr><th>商户</th><th>金额</th></tr>")
        for payee, amt in payee_top:
            parts.append(f"<tr><td>{esc(payee)}</td><td>{fmt(amt)}</td></tr>")
        parts.append("</table>")

    parts.append("</main></body></html>")
    return "\n".join(parts)


def write_out(content, dry_run=False):
    out_dir = os.path.dirname(OUT)
    if dry_run:
        print(f"[dry-run] 将写入 {OUT}")
        return
    os.makedirs(out_dir, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(content)


# ---------------------------------------------------------------- report (query)


def _summarize_records(records, title):
    exp = [r for r in records if r["type"] == "expense"]
    inc = [r for r in records if r["type"] == "income"]
    tot_exp = sum(r["amount_cents"] for r in exp)
    tot_inc = sum(r["amount_cents"] for r in inc)
    lines = [title, f"收入 ¥{fmt(tot_inc)} | 支出 ¥{fmt(tot_exp)} | 结余 ¥{fmt(tot_inc - tot_exp)}"]
    if exp:
        cat = defaultdict(int)
        for r in exp:
            cat[r["category"][0]] += r["amount_cents"]
        top = "、".join(f"{c} ¥{fmt(v)}" for c, v in sorted(cat.items(), key=lambda kv: -kv[1])[:5])
        lines.append(f"支出分类 Top: {top}")
        # 付款人拆分:仅当存在多人付款时附加,避免单人数据噪音。
        payers = defaultdict(int)
        for r in exp:
            payers[r.get("payer", "我")] += r["amount_cents"]
        if len(payers) > 1:
            ps = "、".join(f"{p} ¥{fmt(v)}" for p, v in sorted(payers.items(), key=lambda kv: -kv[1]))
            lines.append(f"按付款人: {ps}")
    return "\n".join(lines)


def run_report(records, meta, q):
    today = date.today()
    if not records:
        return "暂无记录。"
    q = q.strip()

    if q in ("总览", "结余", "收支"):
        return _summarize_records(records, f"总览({len(records)} 条记录)")

    if q.startswith("本月"):
        m = today.strftime("%Y-%m")
        return _summarize_records([r for r in records if r["date"].startswith(m)], f"{m} 收支")

    if q.startswith("上月"):
        first = today.replace(day=1)
        prev = first.fromordinal(first.toordinal() - 1)
        m = prev.strftime("%Y-%m")
        return _summarize_records([r for r in records if r["date"].startswith(m)], f"{m} 收支")

    if q.startswith("今年"):
        y = str(today.year)
        return _summarize_records([r for r in records if r["date"].startswith(y)], f"{y} 年收支")

    if q.startswith("旅行:"):
        trip = q[3:].strip()
        want = f"旅行:{trip}"
        rs = [r for r in records if r["type"] == "expense" and want in (r.get("tags") or [])]
        if not rs:
            return f"未找到行程 {trip} 的消费(检查标签是否 旅行:{trip})。"
        days = len(set(r["date"] for r in rs))
        tot = sum(r["amount_cents"] for r in rs)
        cat = defaultdict(int)
        for r in rs:
            cat[r["category"][0]] += r["amount_cents"]
        cats = "、".join(f"{c} ¥{fmt(v)}" for c, v in sorted(cat.items(), key=lambda kv: -kv[1]))
        payer_tot = defaultdict(int)
        for r in rs:
            payer_tot[r.get("payer", "我")] += r["amount_cents"]
        payers = "、".join(f"{p} ¥{fmt(v)}" for p, v in sorted(payer_tot.items(), key=lambda kv: -kv[1]))
        return (f"行程「{trip}」: {len(rs)} 笔, 覆盖 {days} 天, 总花费 ¥{fmt(tot)}, 日均 ¥{tot / days / 100:.1f}\n"
                f"按付款人: {payers}\n分类明细: {cats}")

    if q.startswith("分类"):
        rest = q[2:].lstrip(":：").strip()
        rs = [r for r in records if r["type"] == "expense" and rest in r["category"]]
        if not rs:
            return f"未找到分类 {rest} 的支出。"
        tot = sum(r["amount_cents"] for r in rs)
        lines = [f"分类「{rest}」支出合计 ¥{fmt(tot)}({len(rs)} 笔)"]
        for r in sorted(rs, key=lambda x: x["date"])[-10:]:
            lines.append(f"  {r['date']} ¥{fmt(r['amount_cents'])} {r.get('note','')} {r.get('payee','')}")
        return "\n".join(lines)

    if q.startswith("最近"):
        n = 5
        for token in q[2:].split():
            if token.isdigit():
                n = int(token)
                break
        rs = sorted(records, key=lambda r: (r.get("date", ""), r.get("id", "")))[-n:][::-1]
        lines = [f"最近 {n} 笔:"]
        for r in rs:
            kind = "收" if r["type"] == "income" else "支"
            cat = "/".join(r["category"])
            payer = r.get("payer", "我")
            payer_tag = f" @{payer}" if payer != "我" else ""
            lines.append(f"  {r['date']} {kind} ¥{fmt(r['amount_cents'])} [{cat}]{payer_tag} {r.get('note','')} {r.get('payee','')}")
        return "\n".join(lines)

    if q.startswith("付款人") or q.startswith("payer"):
        rest = q.split(":", 1)[1].strip() if ":" in q else ""
        rs = [r for r in records if r["type"] == "expense" and (rest == "" or r.get("payer", "我") == rest)]
        if not rs:
            return f"未找到付款人 {rest or '全部'} 的支出(检查 payers 是否注册在 meta.json)。"
        tot = sum(r["amount_cents"] for r in rs)
        cat = defaultdict(int)
        for r in rs:
            cat[r["category"][0]] += r["amount_cents"]
        cats = "、".join(f"{c} ¥{fmt(v)}" for c, v in sorted(cat.items(), key=lambda kv: -kv[1])[:5])
        return f"付款人「{rest or '全部'}」支出合计 ¥{fmt(tot)}({len(rs)} 笔)\n分类 Top: {cats}"

    if q.startswith("账户"):
        acc = defaultdict(int)
        for r in records:
            if r["type"] == "expense":
                acc[r["account"]] += r["amount_cents"]
        return "账户支出:\n" + "\n".join(f"  {a} ¥{fmt(v)}" for a, v in sorted(acc.items(), key=lambda kv: -kv[1]))

    return (
        "支持的 --report 查询:总览 / 本月 / 上月 / 今年 / 旅行:<行程名> / 分类:<分类名> / 最近<N> / 账户 / 付款人[:<名字>]\n"
        f"未识别的查询:{q}"
    )


def main():
    parser = argparse.ArgumentParser(description="记账:合并 data/days/ → 校验 → 仪表盘 / 文本报告。")
    parser.add_argument("--dry-run", action="store_true", help="仅校验,不写入文件。")
    parser.add_argument("--report", nargs="+", metavar="QUERY", help="文本查询报告(只读,不写文件),如:本月 / 旅行:2026北京 / 分类:交通 / 最近5")
    args = parser.parse_args()

    meta = load_meta()
    records = merge_days()
    validate(records, meta)

    if args.report:
        print(run_report(records, meta, " ".join(args.report)))
        return

    write_aggregate(records, dry_run=args.dry_run)
    content = render(records)
    write_out(content, dry_run=args.dry_run)
    n = len(records)
    print(f"OK: {n} 条记录校验通过(合并自 data/days/),web/ledger.html {'将' if args.dry_run else '已'}刷新。")


if __name__ == "__main__":
    main()
