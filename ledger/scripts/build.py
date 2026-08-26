#!/usr/bin/env python3
"""Ledger data pipeline: merge + validate + aggregate + text report.

Source of truth: data/days/YYYY-MM-DD.json (one file per day). build.py merges
all day files into the aggregate data/ledger.json, validates every record against
data/meta.json (category tree / accounts / trip-tag registry), and answers
text --report queries so the agent does NOT need to read raw data files.

The dashboard frontend (Vite + TypeScript + ECharts, in web/) is a SEPARATE
build step (`make`), fed by data/ledger.json. This module never emits HTML.

Usage:
    python3 scripts/build.py                  # merge + validate + write aggregate
    python3 scripts/build.py --dry-run        # merge + validate only, no writes
    python3 scripts/build.py --report 本月    # text report: this month income/expense/balance
    python3 scripts/build.py --report 旅行:2026北京
    python3 scripts/build.py --report 分类:交通
    python3 scripts/build.py --report 最近5
    python3 scripts/build.py --report 总览
    python3 scripts/build.py --report 付款人:女友      # 某付款人全部净支出
    python3 scripts/build.py --report 付款人           # 按付款人拆分全部净支出
    python3 scripts/build.py --aggregates-json        # machine-readable aggregates (for parity)
"""
import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAYS_DIR = os.path.join(ROOT, "data", "days")
LEDGER = os.path.join(ROOT, "data", "ledger.json")
META = os.path.join(ROOT, "data", "meta.json")

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

        if r.get("type") not in ("expense", "income", "refund"):
            fail(f"{rid}:type 应为 expense / income / refund。")

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

        if amt > BIG_AMOUNT_CENTS and r.get("type") in ("expense", "refund"):
            warn(f"{rid}:单笔 {amt / 100:.2f} 元超过 ¥10000,请确认未多写一个零。")

    # 数据完整性提示:退款总额超过支出总额,通常说明记了退票但漏记原支出,
    # 会导致净支出为负、储蓄率 >100%、分类金额为负。低成本的兜底,不阻断构建。
    tot_exp = sum(r.get("amount_cents", 0) for r in records if r.get("type") == "expense")
    tot_ref = sum(r.get("amount_cents", 0) for r in records if r.get("type") == "refund")
    if tot_ref > tot_exp:
        warn(
            f"退款总额 ¥{tot_ref / 100:.2f} 超过支出总额 ¥{tot_exp / 100:.2f}:"
            f"可能存在记了退票但漏记原支出的情况(退款的 category/tags/payer 应与原支出一致)。"
        )

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


# ================================================================ aggregates
# 单一事实来源:render() 与原 run_report 各算一份聚合(储蓄率/月度趋势只在旧 render() 里)。
# 现将所有聚合抽成纯函数,--aggregates-json 与 run_report 共用,消除双实现。
# 口径基准 = run_report 现有可观测输出;render-only 项(储蓄率/月度趋势/二级分类 rollup/占比)
# 只进 --aggregates-json,不回灌 --report。详见仓库方案文档。


def _net_of(records, types):
    """返回 (tot_expense, tot_refund, net) 仅含指定 type 集合的净额(分)。"""
    exp = sum(r["amount_cents"] for r in records if r["type"] == "expense" and r["type"] in types)
    ref = sum(r["amount_cents"] for r in records if r["type"] == "refund" and r["type"] in types)
    return exp, ref, exp - ref


def compute_summary(records):
    """总收入 / 净支出 / 退款 / 结余 / 储蓄率。储蓄率在 tot_inc==0 时返回 None。"""
    expenses = [r for r in records if r["type"] == "expense"]
    incomes = [r for r in records if r["type"] == "income"]
    refunds = [r for r in records if r["type"] == "refund"]
    tot_exp = sum(r["amount_cents"] for r in expenses)
    tot_inc = sum(r["amount_cents"] for r in incomes)
    tot_ref = sum(r["amount_cents"] for r in refunds)
    net_exp = tot_exp - tot_ref
    balance = tot_inc - net_exp
    savings_rate = (balance / tot_inc * 100) if tot_inc else None
    return {
        "totalIncome": tot_inc,
        "netExpense": net_exp,
        "totalRefund": tot_ref,
        "balance": balance,
        "savingsRate": round(savings_rate, 2) if savings_rate is not None else None,
    }


def compute_monthly(records):
    """月度收支趋势:refund 作为负支出冲减当月;环比 prev 为 0 时显示 None。"""
    monthly = defaultdict(lambda: {"income": 0, "expense": 0})
    for r in records:
        m = r["date"][:7]
        if r["type"] == "refund":
            monthly[m]["expense"] -= r["amount_cents"]
        else:
            monthly[m][r["type"]] += r["amount_cents"]
    months = sorted(monthly)
    rows = []
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
        rows.append({
            "month": m,
            "income": inc,
            "expense": exp,
            "balance": inc - exp,
            "momIncome": round(mom_inc, 2) if mom_inc is not None else None,
            "momExpense": round(mom_exp, 2) if mom_exp is not None else None,
        })
    return rows


def compute_categories(records):
    """一级/二级分类净支出 rollup(退款作为负支出冲减);占比以全局 net_exp 为分母。"""
    net_exp = _net_of(records, ("expense", "refund"))[2]
    top_tot = defaultdict(int)
    sub_tot = defaultdict(lambda: defaultdict(int))
    for r in records:
        if r["type"] not in ("expense", "refund"):
            continue
        sign = 1 if r["type"] == "expense" else -1
        amt = r["amount_cents"] * sign
        path = r["category"]
        top_tot[path[0]] += amt
        if len(path) > 1:
            sub_tot[path[0]][path[1]] += amt
    items = []
    for top, amount in top_tot.items():
        children = [
            {"name": c, "amount": v}
            for c, v in sorted(sub_tot[top].items(), key=lambda kv: (-kv[1], kv[0]))
        ]
        items.append({
            "name": top,
            "amount": amount,
            "pct": round(amount / net_exp * 100, 2) if net_exp else 0,
            "children": children,
        })
    items.sort(key=lambda it: (-it["amount"], it["name"]))
    return items


def compute_income_categories(records):
    """收入分类(一级/二级 rollup),占比以总收入为分母。"""
    tot_inc = sum(r["amount_cents"] for r in records if r["type"] == "income")
    top_tot = defaultdict(int)
    sub_tot = defaultdict(lambda: defaultdict(int))
    for r in records:
        if r["type"] != "income":
            continue
        path = r["category"]
        top_tot[path[0]] += r["amount_cents"]
        if len(path) > 1:
            sub_tot[path[0]][path[1]] += r["amount_cents"]
    items = []
    for top, amount in top_tot.items():
        children = [
            {"name": c, "amount": v}
            for c, v in sorted(sub_tot[top].items(), key=lambda kv: (-kv[1], kv[0]))
        ]
        items.append({
            "name": top,
            "amount": amount,
            "pct": round(amount / tot_inc * 100, 2) if tot_inc else 0,
            "children": children,
        })
    items.sort(key=lambda it: (-it["amount"], it["name"]))
    return items


def compute_accounts(records):
    """账户净支出(退款作为负支出冲减),占比以全局 net_exp 为分母。"""
    net_exp = _net_of(records, ("expense", "refund"))[2]
    acc_tot = defaultdict(int)
    for r in records:
        if r["type"] == "expense":
            acc_tot[r["account"]] += r["amount_cents"]
        elif r["type"] == "refund":
            acc_tot[r["account"]] -= r["amount_cents"]
    rows = [
        {
            "name": a,
            "amount": v,
            "pct": round(v / net_exp * 100, 2) if net_exp else 0,
        }
        for a, v in acc_tot.items()
    ]
    rows.sort(key=lambda it: (-it["amount"], it["name"]))
    return rows


def compute_payers(records):
    """付款人净支出(退款作为负支出冲减),占比以全局 net_exp 为分母。"""
    net_exp = _net_of(records, ("expense", "refund"))[2]
    payer_tot = defaultdict(int)
    for r in records:
        if r["type"] == "expense":
            payer_tot[r.get("payer", "我")] += r["amount_cents"]
        elif r["type"] == "refund":
            payer_tot[r.get("payer", "我")] -= r["amount_cents"]
    rows = [
        {
            "name": p,
            "amount": v,
            "pct": round(v / net_exp * 100, 2) if net_exp else 0,
        }
        for p, v in payer_tot.items()
    ]
    rows.sort(key=lambda it: (-it["amount"], it["name"]))
    return rows


def compute_trips(records):
    """行程拆解:天数=去重支出日期(refund 不计)、总花费、日均、按分类、按付款人。

    一条记录可带多个 旅行: 标签,对其中每个行程都计入(与原 render 口径一致)。
    income 不计入行程花费。
    """
    trip_tot = defaultdict(int)
    trip_days = defaultdict(set)
    trip_cats = defaultdict(lambda: defaultdict(int))
    trip_payers = defaultdict(lambda: defaultdict(int))
    for r in records:
        if r["type"] not in ("expense", "refund"):
            continue
        sign = 1 if r["type"] == "expense" else -1
        amt = r["amount_cents"] * sign
        for t in (r.get("tags") or []):
            if not t.startswith("旅行:"):
                continue
            trip = t[3:]
            trip_tot[trip] += amt
            if r["type"] == "expense":
                trip_days[trip].add(r["date"])
            if r.get("category"):
                trip_cats[trip][r["category"][0]] += amt
            trip_payers[trip][r.get("payer", "我")] += amt
    rows = []
    for trip in sorted(trip_tot, key=lambda k: (-trip_tot[k], k)):
        days = len(trip_days[trip])
        total = trip_tot[trip]
        avg = total / days if days else 0
        cats = [
            {"name": c, "amount": v}
            for c, v in sorted(trip_cats[trip].items(), key=lambda kv: (-kv[1], kv[0]))
        ]
        payers = [
            {"name": p, "amount": v}
            for p, v in sorted(trip_payers[trip].items(), key=lambda kv: (-kv[1], kv[0]))
        ]
        rows.append({
            "trip": trip,
            "days": days,
            "total": total,
            "avg": round(avg, 2),
            "categories": cats,
            "payers": payers,
        })
    return rows


def compute_payee_top(records, n=10):
    """交易对象 Top-N:只统计有 payee 的支出/退款(退款作为负支出冲减)。"""
    payee_tot = defaultdict(int)
    for r in records:
        if r["type"] not in ("expense", "refund"):
            continue
        if not r.get("payee"):
            continue
        sign = 1 if r["type"] == "expense" else -1
        payee_tot[r["payee"]] += r["amount_cents"] * sign
    return [
        {"name": p, "amount": v}
        for p, v in sorted(payee_tot.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
    ]


def build_aggregates(records):
    """聚合产物的规范结构,供 --aggregates-json 与前端 parity 对账共用。"""
    return {
        "empty": len(records) == 0,
        "summary": compute_summary(records),
        "monthly": compute_monthly(records),
        "categories": compute_categories(records),
        "incomeCategories": compute_income_categories(records),
        "accounts": compute_accounts(records),
        "payers": compute_payers(records),
        "trips": compute_trips(records),
        "payeeTop": compute_payee_top(records),
    }


# ================================================================ report (query)


def _summarize_records(records, title):
    exp = [r for r in records if r["type"] == "expense"]
    inc = [r for r in records if r["type"] == "income"]
    ref = [r for r in records if r["type"] == "refund"]
    tot_exp = sum(r["amount_cents"] for r in exp)
    tot_inc = sum(r["amount_cents"] for r in inc)
    tot_ref = sum(r["amount_cents"] for r in ref)
    net_exp = tot_exp - tot_ref
    s = compute_summary(records)
    lines = [
        title,
        f"收入 ¥{fmt(s['totalIncome'])} | 净支出 ¥{fmt(s['netExpense'])} | 退款 ¥{fmt(s['totalRefund'])} | 结余 ¥{fmt(s['balance'])}",
    ]
    if exp or ref:
        cats = compute_categories(records)
        top = "、".join(f"{c['name']} ¥{fmt(c['amount'])}" for c in cats[:5])
        lines.append(f"支出分类 Top: {top}")
        # 付款人拆分:仅当存在多人付款时附加,避免单人数据噪音。
        payers = compute_payers(records)
        if len(payers) > 1:
            ps = "、".join(f"{p['name']} ¥{fmt(p['amount'])}" for p in payers)
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
        rs = [r for r in records if r["type"] in ("expense", "refund") and want in (r.get("tags") or [])]
        if not rs:
            return f"未找到行程 {trip} 的消费(检查标签是否 旅行:{trip})。"
        hit = next((t for t in compute_trips(records) if t["trip"] == trip), None)
        if hit is None:
            return f"未找到行程 {trip} 的消费(检查标签是否 旅行:{trip})。"
        days = hit["days"]
        tot = hit["total"]
        cats = "、".join(f"{c['name']} ¥{fmt(c['amount'])}" for c in hit["categories"])
        payers = "、".join(f"{p['name']} ¥{fmt(p['amount'])}" for p in hit["payers"])
        avg_yuan = (tot / days / 100) if days else 0
        return (f"行程「{trip}」: {len(rs)} 笔, 覆盖 {days} 天, 总花费 ¥{fmt(tot)}, 日均 ¥{avg_yuan:.1f}\n"
                f"按付款人: {payers}\n分类明细: {cats}")

    if q.startswith("分类"):
        rest = q[2:].lstrip(":：").strip()
        rs = [r for r in records if r["type"] in ("expense", "refund") and rest in r["category"]]
        if not rs:
            return f"未找到分类 {rest} 的支出。"
        tot = 0
        for r in rs:
            tot += r["amount_cents"] * (1 if r["type"] == "expense" else -1)
        lines = [f"分类「{rest}」净支出 ¥{fmt(tot)}({len(rs)} 笔)"]
        for r in sorted(rs, key=lambda x: x["date"])[-10:]:
            sign = "" if r["type"] == "expense" else " (退)"
            lines.append(f"  {r['date']} ¥{fmt(r['amount_cents'])}{sign} {r.get('note','')} {r.get('payee','')}")
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
            kind = "收" if r["type"] == "income" else ("退" if r["type"] == "refund" else "支")
            cat = "/".join(r["category"])
            payer = r.get("payer", "我")
            payer_tag = f" @{payer}" if payer != "我" else ""
            lines.append(f"  {r['date']} {kind} ¥{fmt(r['amount_cents'])} [{cat}]{payer_tag} {r.get('note','')} {r.get('payee','')}")
        return "\n".join(lines)

    if q.startswith("付款人") or q.startswith("payer"):
        rest = q.split(":", 1)[1].strip() if ":" in q else ""
        rs = [r for r in records if r["type"] in ("expense", "refund") and (rest == "" or r.get("payer", "我") == rest)]
        if not rs:
            return f"未找到付款人 {rest or '全部'} 的支出(检查 payers 是否注册在 meta.json)。"
        tot = 0
        for r in rs:
            tot += r["amount_cents"] * (1 if r["type"] == "expense" else -1)
        cat = defaultdict(int)
        for r in rs:
            cat[r["category"][0]] += r["amount_cents"] * (1 if r["type"] == "expense" else -1)
        cats = "、".join(f"{c} ¥{fmt(v)}" for c, v in sorted(cat.items(), key=lambda kv: -kv[1])[:5])
        return f"付款人「{rest or '全部'}」净支出合计 ¥{fmt(tot)}({len(rs)} 笔)\n分类 Top: {cats}"

    if q.startswith("账户"):
        acc = compute_accounts(records)
        return "账户净支出:\n" + "\n".join(f"  {a['name']} ¥{fmt(a['amount'])}" for a in acc)

    return (
        "支持的 --report 查询:总览 / 本月 / 上月 / 今年 / 旅行:<行程名> / 分类:<分类名> / 最近<N> / 账户 / 付款人[:<名字>]\n"
        f"未识别的查询:{q}"
    )


def main():
    parser = argparse.ArgumentParser(description="记账数据管道:合并 data/days/ → 校验 → 聚合 → 文本报告。")
    parser.add_argument("--dry-run", action="store_true", help="仅校验,不写入文件。")
    parser.add_argument("--report", nargs="+", metavar="QUERY", help="文本查询报告(只读,不写文件),如:本月 / 旅行:2026北京 / 分类:交通 / 最近5")
    parser.add_argument("--aggregates-json", action="store_true", help="输出规范聚合 JSON(供前端 parity 对账),不写文件")
    args = parser.parse_args()

    meta = load_meta()
    records = merge_days()
    validate(records, meta)

    if args.aggregates_json:
        print(json.dumps(build_aggregates(records), sort_keys=True, ensure_ascii=False, indent=2))
        return

    if args.report:
        print(run_report(records, meta, " ".join(args.report)))
        return

    write_aggregate(records, dry_run=args.dry_run)
    n = len(records)
    verb = "将写入" if args.dry_run else "已写入"
    print(f"OK: {n} 条记录校验通过(合并自 data/days/),聚合{verb} data/ledger.json。"
          f"仪表盘需另跑 `make`(web/dist/index.html) 刷新。")


if __name__ == "__main__":
    main()
