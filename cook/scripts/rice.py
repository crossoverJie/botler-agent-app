#!/usr/bin/env python3
"""米饭生熟重与配比计算（单一计算来源）。

权威公式见 background.md：每顿生重 = 熟饭克数 ÷ 2.3（综合倍率），再按 70/20/10 拆分。
此前手算曾把公式方向写反、且下调熟重后忘记同步重算生重；本脚本接管全部计算，
今后改计划只改配置/参数、重跑即可，不再手算。

用法：
    python3 scripts/rice.py                      # 读 config.json 的 rice 段，打印可读报告
    python3 scripts/rice.py --markdown           # 同上，额外输出可粘贴进周报的表格行
    python3 scripts/rice.py --lunch 250 --dinner 200 --markdown   # CLI 覆盖参数核对旧方案
"""
import argparse
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "data", "config.json")

DEFAULT_FACTOR = 2.3
DEFAULT_RATIO = (0.7, 0.2, 0.1)  # 白米 / 糙米 / 鹰嘴豆
RICE_NAMES = ("白米", "糙米", "鹰嘴豆")
DEFAULT_DAYS = 4
DEFAULT_LUNCH = 200
DEFAULT_DINNER = 150


def load_rice_config():
    """读取 data/config.json 的 rice 段；缺失时回退到内置默认值。"""
    if not os.path.exists(CFG):
        return {}
    try:
        with open(CFG, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}
    rice = data.get("rice", {})
    return rice if isinstance(rice, dict) else {}


def distribute(total, ratio):
    """按 ratio 拆分 total，保证各分量取整后之和 == round(total)。

    直接对每项 round() 会导致分量之和与总量差 1g（四舍五入误差）。
    这里用最大余数法：先向下取整，再把余数逐个补给小数部分最大的分量。
    """
    vals = [total * r for r in ratio]
    floored = [int(math.floor(v)) for v in vals]
    remainder = round(total) - sum(floored)
    order = sorted(range(len(vals)), key=lambda i: vals[i] - floored[i], reverse=True)
    for i in range(remainder):
        floored[order[i]] += 1
    return tuple(floored)


def compute_rice(lunch_cooked, dinner_cooked, days=DEFAULT_DAYS,
                 factor=DEFAULT_FACTOR, ratio=DEFAULT_RATIO):
    """由每顿熟重计算总生重、配比拆分与每顿生重。

    公式：raw = cooked / factor（即 熟重 ÷ 2.3 = 生重，与 background.md 一致）。
    """
    per_day_cooked = lunch_cooked + dinner_cooked
    total_cooked = per_day_cooked * days
    total_raw = total_cooked / factor
    raw_breakdown = distribute(total_raw, ratio)
    return {
        "lunch_cooked": lunch_cooked,
        "dinner_cooked": dinner_cooked,
        "days": days,
        "factor": factor,
        "ratio": tuple(ratio),
        "per_day_cooked": per_day_cooked,
        "total_cooked": total_cooked,
        "total_raw": total_raw,
        "raw_breakdown": raw_breakdown,
        "lunch_raw": lunch_cooked / factor,
        "dinner_raw": dinner_cooked / factor,
    }


def markdown_row(plan):
    """生成可直接粘贴进周报第一节的整行表格。"""
    total_raw = round(plan["total_raw"])
    parts = "+".join(str(b) for b in plan["raw_breakdown"])
    factor = plan["factor"]
    return (
        "| 米饭（熟，70%白米+20%糙米+10%鹰嘴豆） | "
        f"生重 {total_raw}g（{parts}） | "
        f"**午餐{round(plan['lunch_cooked'])}g / 晚餐{round(plan['dinner_cooked'])}g（熟）** | "
        f"按文档B方案，生重×{factor}≈熟重（即 熟重÷{factor}=生重） |"
    )


def format_report(plan):
    p = plan
    lines = [
        "米饭重量计算（生重 = 熟重 ÷ 综合倍率）",
        f"  每顿熟重 : 午餐 {p['lunch_cooked']}g / 晚餐 {p['dinner_cooked']}g",
        f"  每日熟重 : {p['per_day_cooked']}g",
        f"  总熟重   : {p['total_cooked']}g（{p['days']}天 × 每日{p['per_day_cooked']}g）",
        f"  综合倍率 : {p['factor']}",
        f"  总生重   : {round(p['total_raw'])}g（= 总熟重 ÷ {p['factor']}）",
        "  生重拆分(70/20/10):",
    ]
    for name, val in zip(RICE_NAMES, p["raw_breakdown"]):
        lines.append(f"    {name}: {val}g")
    lines.append(
        f"  每顿生重 : 午餐 {round(p['lunch_raw'])}g / 晚餐 {round(p['dinner_raw'])}g"
    )
    return "\n".join(lines)


def main(argv=None):
    cfg = load_rice_config()
    p_factor = cfg.get("factor", DEFAULT_FACTOR)
    p_ratio = tuple(cfg.get("ratio", DEFAULT_RATIO))
    p_days = cfg.get("days", DEFAULT_DAYS)
    p_lunch = cfg.get("lunchCooked", DEFAULT_LUNCH)
    p_dinner = cfg.get("dinnerCooked", DEFAULT_DINNER)

    parser = argparse.ArgumentParser(description="米饭生熟重与配比计算")
    parser.add_argument("--lunch", type=float, default=None, help="午餐熟重(g)")
    parser.add_argument("--dinner", type=float, default=None, help="晚餐熟重(g)")
    parser.add_argument("--days", type=int, default=None, help="天数（默认4，共8顿）")
    parser.add_argument("--factor", type=float, default=None, help="综合倍率（默认2.3）")
    parser.add_argument("--ratio", type=float, nargs=3, default=None,
                        metavar=("WHITE", "BROWN", "CHICKPEA"),
                        help="配比 白米/糙米/鹰嘴豆（默认 0.7 0.2 0.1）")
    parser.add_argument("--markdown", action="store_true",
                        help="额外输出可粘贴进周报的表格行")
    args = parser.parse_args(argv)

    lunch = args.lunch if args.lunch is not None else p_lunch
    dinner = args.dinner if args.dinner is not None else p_dinner
    days = args.days if args.days is not None else p_days
    factor = args.factor if args.factor is not None else p_factor
    ratio = tuple(args.ratio) if args.ratio is not None else p_ratio

    plan = compute_rice(lunch, dinner, days, factor, ratio)

    print(format_report(plan))
    if args.markdown:
        print()
        print("周报表格行（可直接粘贴）：")
        print(markdown_row(plan))


if __name__ == "__main__":
    main()
