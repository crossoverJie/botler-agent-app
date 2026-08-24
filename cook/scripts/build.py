#!/usr/bin/env python3
"""Build nutrition visualization from data/intake.json.

- Injects data into nutrition.html (self-contained, double-click to open).
- Regenerates the "每日实际摄入记录" table inside each weekly-*.md.
- Best-effort rebuilds the web calendar dashboard (cd web && npm run build)
  so it also picks up the latest data (skipped if Node/npm is absent).
- Validates that top-level daily totals match the sum of per-meal foods and
  cross-checks per-food macros against data/foods.json.

Usage:
    python3 scripts/build.py           # normal run, writes files (+ web build)
    python3 scripts/build.py --dry-run # validate only, no writes
    python3 scripts/build.py --no-web  # skip the web dashboard build
"""
import argparse
import json
import os
import re
import sys
import glob
import shutil
import subprocess
from datetime import date, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAYS_DIR = os.path.join(ROOT, "data", "days")
DATA = os.path.join(ROOT, "data", "intake.json")
FOODS = os.path.join(ROOT, "data", "foods.json")
CFG = os.path.join(ROOT, "data", "config.json")
HTML = os.path.join(ROOT, "nutrition.html")
WEEKLY_DIR = os.path.join(ROOT, "weekly")
WEB_DIR = os.path.join(ROOT, "web")
TOLERANCE = 0.5


def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg):
    print(f"WARN: {msg}", file=sys.stderr)


def read_json(path):
    if not os.path.exists(path):
        fail(f"找不到文件：{path}")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        fail(f"{path} 不是合法 JSON：{e}")


def merge_days():
    """读取 data/days/*.json，合并为 list 返回（只读，不落盘）。

    护栏：空目录、顶层非对象、文件名 ≠ 内部 date 均硬失败。
    data/days/ 是唯一真相源；data/intake.json 只是 build.py 生成的聚合产物。
    """
    files = sorted(glob.glob(os.path.join(DAYS_DIR, "*.json")))
    if not files:
        fail("data/days/ 为空——请先完成迁移，拒绝生成空聚合以保护历史。")
    data = []
    for path in files:
        d = read_json(path)
        if not isinstance(d, dict):
            fail(f"{path} 顶层应为对象，实际为 {type(d).__name__}。")
        # 文件名即日期权威来源，防漂移（文件名唯一性同时保证了 date 唯一）
        if os.path.basename(path) != f"{d.get('date')}.json":
            fail(f"{path} 的文件名与其内部 date 字段（{d.get('date')}）不一致。")
        data.append(d)
    return data


def write_intake(data, dry_run=False):
    """把合并结果写回 data/intake.json。

    幂等：语义一致则跳过写入，避免无噪音 git diff（防止双源漂移产生过期聚合）。
    尊重 dry_run：不会真正落盘。
    """
    content = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if os.path.exists(DATA):
        try:
            with open(DATA, encoding="utf-8") as f:
                if json.load(f) == data:
                    return
        except json.JSONDecodeError:
            pass  # 磁盘聚合损坏时强制重写
    write_file(DATA, content, dry_run=dry_run)


def load():
    data = merge_days()
    foods = read_json(FOODS)
    cfg = read_json(CFG)

    if not isinstance(data, list):
        fail("data/intake.json 顶层应为记录数组。")
    if "foods" not in foods:
        fail("data/foods.json 缺少顶层 'foods' 键。")
    req = ("date", "calories", "protein", "fat", "carb", "fiber")
    for i, d in enumerate(data):
        for k in req:
            if k not in d:
                fail(f"第 {i} 条记录缺少字段 {k}。")
        if not isinstance(d.get("date"), str):
            fail(f"第 {i} 条记录的 date 应为字符串（如 2026-08-03）。")
        if not isinstance(d.get("meals"), dict):
            fail(f"第 {i} 条记录（{d.get('date')}）缺少 'meals' 对象。")
    for k in ("tdee", "weightKg", "targets"):
        if k not in cfg:
            fail(f"config.json 缺少字段 {k}。")
    return data, foods["foods"], cfg


def parse_amount(amount):
    """从 '258g'、'6个' 等字符串中提取克数。

    目前支持纯数字后缀 'g'。非克数单位（如 '6个'）需要 foods.json 中
    的 per 字段已按实际可食部折算，此时本函数返回 1 份。
    """
    s = str(amount).strip()
    m = re.match(r"^(\d+(?:\.\d+)?)\s*[gG]$", s)
    if m:
        return float(m.group(1))
    # 尝试从括号中提取 ≈100g
    m = re.search(r"[≈~]?(\d+(?:\.\d+)?)\s*[gG]", s)
    if m:
        return float(m.group(1))
    return None


def validate_meals(record, food_db, idx):
    """校验单条记录的 meals 合计与顶层 totals 一致，并与 foods.json 交叉核对。"""
    date = record["date"]
    keys = ("calories", "protein", "fat", "carb", "fiber")
    meal_sums = {k: 0.0 for k in keys}
    for meal_name, meal in record.get("meals", {}).items():
        for food in meal.get("foods", []):
            # 无论能否交叉校验，都先累加进 meals 合计（顶层 totals 校验依赖它）
            for k in keys:
                meal_sums[k] += food.get(k, 0)
            name = food.get("name")
            if name not in food_db:
                warn(f"{date} / {meal_name}：食材 '{name}' 不在 foods.json 中，跳过交叉校验。")
                continue
            ref = food_db[name]
            amount = parse_amount(food.get("amount", ""))
            if amount is None:
                warn(f"{date} / {meal_name} / {name}：无法解析克数 '{food.get('amount')}'，跳过交叉校验。")
                continue
            ratio = amount / ref["per"]
            for k in keys:
                expected = ref[{"calories": "kcal"}.get(k, k)] * ratio
                actual = food.get(k, 0)
                if abs(actual - expected) > TOLERANCE:
                    warn(f"{date} / {meal_name} / {name}：{k} 记录值 {actual} 与 foods.json 期望值 {round(expected, 1)} 不符。")
    for k in keys:
        top = record.get(k, 0)
        s = round(meal_sums[k], 1)
        if abs(top - s) > TOLERANCE:
            fail(f"{date}：顶层 {k}={top} 与 meals 合计 {s} 不一致。")


def validate_water(record, idx):
    """校验饮水：顶层 water 总量 = waters 明细各条 amount 之和（硬失败）。

    - 有 waters 明细但缺顶层 water，或合计不一致 -> 硬失败。
    - 有顶层 water 但缺 waters 明细（旧格式）-> 仅告警，督促补明细。
    """
    date = record["date"]
    waters = record.get("waters")
    water = record.get("water")
    if waters is None:
        if water is not None:
            warn(f"{date}：有顶层 water={water} 但缺 waters 明细（旧格式），建议补充明细。")
        return
    if not isinstance(waters, list):
        fail(f"{date}：waters 应为数组。")
    total = 0.0
    for j, w in enumerate(waters):
        if not isinstance(w, dict):
            fail(f"{date}：waters 第 {j} 条应为对象。")
        amt = w.get("amount")
        if not isinstance(amt, (int, float)) or isinstance(amt, bool):
            fail(f"{date}：waters 第 {j} 条缺少数字 amount。")
        if not isinstance(w.get("type"), str) or not w["type"].strip():
            fail(f"{date}：waters 第 {j} 条缺少字符串 type。")
        total += amt
    if water is None:
        fail(f"{date}：有 waters 明细但缺顶层 water 总量。")
    if abs(total - water) > TOLERANCE:
        fail(f"{date}：顶层 water={water} 与 waters 合计 {round(total, 1)} 不一致。")


def validate_targets(data, cfg):
    """根据 config.json 中的 targets 给出提醒。"""
    tdee = cfg.get("tdee", 2400)
    weight = cfg.get("weightKg", 69)
    targets = cfg.get("targets", {})
    for d in data:
        date = d["date"]
        protein_per_kg = d["protein"] / weight
        deficit_pct = (tdee - d["calories"]) / tdee * 100 if tdee else 0
        if "proteinPerKgMin" in targets and protein_per_kg < targets["proteinPerKgMin"]:
            warn(f"{date}：蛋白质 {round(protein_per_kg, 2)} g/kg 低于目标下限 {targets['proteinPerKgMin']}。")
        if "proteinPerKgMax" in targets and protein_per_kg > targets["proteinPerKgMax"]:
            warn(f"{date}：蛋白质 {round(protein_per_kg, 2)} g/kg 高于目标上限 {targets['proteinPerKgMax']}。")
        if "fatMin" in targets and d["fat"] < targets["fatMin"]:
            warn(f"{date}：脂肪 {d['fat']} g 低于目标下限 {targets['fatMin']} g。")
        if "fatMax" in targets and d["fat"] > targets["fatMax"]:
            warn(f"{date}：脂肪 {d['fat']} g 高于目标上限 {targets['fatMax']} g。")
        if "fiberMin" in targets and d["fiber"] < targets["fiberMin"]:
            warn(f"{date}：膳食纤维 {d['fiber']} g 低于目标下限 {targets['fiberMin']} g。")
        if "fiberMax" in targets and d["fiber"] > targets["fiberMax"]:
            warn(f"{date}：膳食纤维 {d['fiber']} g 高于目标上限 {targets['fiberMax']} g。")
        if "carbMin" in targets and d["carb"] < targets["carbMin"]:
            warn(f"{date}：碳水 {d['carb']} g 低于目标下限 {targets['carbMin']} g。")
        if "carbMax" in targets and d["carb"] > targets["carbMax"]:
            warn(f"{date}：碳水 {d['carb']} g 高于目标上限 {targets['carbMax']} g。")
        if "deficitMaxPct" in targets and deficit_pct > targets["deficitMaxPct"]:
            warn(f"{date}：热量缺口 {round(deficit_pct)}% 高于目标上限 {targets['deficitMaxPct']}%。")


def esc_cell(s):
    """Markdown 表格单元格转义：| 会拆列，换行会拆行。"""
    return str(s).replace("|", "\\|").replace("\n", "<br>").replace("\r", "")


def fmt_num(x):
    """表格数字格式化：整数不保留小数，其余保留一位。"""
    if isinstance(x, (int, float)) and x == int(x):
        return str(int(x))
    return str(x)


def write_file(path, content, dry_run=False):
    if dry_run:
        print(f"[dry-run] 将写入 {path}")
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def inject_html(data, cfg, dry_run=False):
    if not os.path.exists(HTML):
        fail(f"找不到模板文件：{HTML}")
    with open(HTML, encoding="utf-8") as f:
        html = f.read()
    data_block = "const DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";"
    cfg_block = "const CONFIG = " + json.dumps(cfg, ensure_ascii=False, indent=2) + ";"
    new_html, n1 = re.subn(
        r"/\*__DATA_START__\*/.*?/\*__DATA_END__\*/",
        "/*__DATA_START__*/\n" + data_block + "\n/*__DATA_END__*/",
        html, flags=re.S)
    new_html, n2 = re.subn(
        r"/\*__CONFIG_START__\*/.*?/\*__CONFIG_END__\*/",
        "/*__CONFIG_START__*/\n" + cfg_block + "\n/*__CONFIG_END__*/",
        new_html, flags=re.S)
    if n1 == 0 or n2 == 0:
        fail("nutrition.html 缺少 __DATA__ 或 __CONFIG__ 注入标记，已跳过写入以避免静默无改动。")
    write_file(HTML, new_html, dry_run=dry_run)


def update_weekly(data, cfg, dry_run=False):
    tdee = cfg.get("tdee", 2400)
    files = sorted(glob.glob(os.path.join(WEEKLY_DIR, "weekly-*.md")))
    updated = 0
    for path in files:
        m = re.search(r"(\d{8})", os.path.basename(path))
        if not m:
            continue
        ds = m.group(1)
        try:
            start = date(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
        except ValueError:
            fail(f"{os.path.basename(path)} 文件名中的日期 {ds} 非法（应为 YYYYMMDD，且月份 1-12、日期合法）。")
        end = start + timedelta(days=6)
        rows = [d for d in data if start.isoformat() <= d["date"] <= end.isoformat()]
        rows.sort(key=lambda x: x["date"])
        if not rows:
            continue
        lines = [
            "| 日期 | 热量(kcal) | 蛋白(g) | 脂肪(g) | 碳水(g) | 纤维(g) | 备注 |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ]
        tot_cal = tot_p = tot_f = tot_c = tot_fib = 0
        for d in rows:
            lines.append("| {date} | {cal} | {p} | {f} | {c} | {fib} | {note} |".format(
                date=d["date"], cal=fmt_num(d["calories"]), p=fmt_num(d["protein"]),
                f=fmt_num(d["fat"]), c=fmt_num(d["carb"]), fib=fmt_num(d["fiber"]),
                note=esc_cell(d.get("note", ""))))
            tot_cal += d["calories"]
            tot_p += d["protein"]
            tot_f += d["fat"]
            tot_c += d["carb"]
            tot_fib += d["fiber"]
        n = len(rows)
        avg = tot_cal / n
        target = tdee * n
        deficit = target - tot_cal
        pct = deficit / target * 100 if target else 0
        lines.append("")
        lines.append("> 周累计（{n}天）：**{tot} kcal**，日均 ≈ **{avg} kcal**（缺口 vs TDEE {tdee} ≈ **{deficit} kcal（周），日均 {avgdef} kcal/天，占 {pct}%**）。".format(
            n=n, tot=round(tot_cal), avg=round(avg), tdee=tdee,
            deficit=round(deficit), avgdef=round(deficit / n), pct=round(pct)))
        block = "\n".join(lines)
        with open(path, encoding="utf-8") as f:
            md = f.read()
        new_md, n_subs = re.subn(
            r"<!--AUTO_DAILY_START-->.*?<!--AUTO_DAILY_END-->",
            "<!--AUTO_DAILY_START-->\n" + block + "\n<!--AUTO_DAILY_END-->",
            md, flags=re.S)
        if n_subs == 0:
            fail(f"{os.path.basename(path)} 缺少 <!--AUTO_DAILY_START-->/<!--AUTO_DAILY_END--> 标记，已跳过以免静默无改动。")
        write_file(path, new_md, dry_run=dry_run)
        updated += 1
    return updated


def build_web(dry_run=False, skip=False):
    """尽力而为地重新构建 web 日历仪表盘（cd web && npm run build）。

    非阻断：缺少 web/ 或 npm 时仅告警跳过；构建失败也仅告警，不中断
    核心的 Python 流水线（校验 + nutrition.html + 周报）。
    """
    if skip:
        return
    if not os.path.isdir(WEB_DIR):
        warn("未找到 web/ 目录，跳过新版日历仪表盘构建。")
        return
    npm = shutil.which("npm")
    if npm is None:
        warn("未检测到 npm（Node.js），跳过 web 仪表盘构建；可手动 cd web && npm run build。")
        return
    if dry_run:
        print("[dry-run] 将执行：cd web && npm run build")
        return
    print("=> 构建 web 日历仪表盘 (cd web && npm run build) ...")
    try:
        subprocess.run([npm, "run", "build"], cwd=WEB_DIR, check=True)
        print("OK: web/dist/index.html 已随最新数据刷新。")
    except subprocess.CalledProcessError as e:
        warn(f"web 仪表盘构建失败（npm run build 退出码 {e.returncode}），已跳过；可手动 cd web && npm run build 排查。")


def deploy(dry_run=False):
    """尽力而为地把 web/dist/index.html 部署到公开的 index 展示仓库。

    调用 scripts/deploy.py（复制 + git push + 打印 DEPLOY_OK 链接），非阻断。
    """
    script = os.path.join(ROOT, "scripts", "deploy.py")
    if not os.path.isfile(script):
        return
    cmd = [sys.executable, script]
    if dry_run:
        cmd.append("--dry-run")
    subprocess.run(cmd)


def main():
    parser = argparse.ArgumentParser(description="生成营养可视化与周报表格。")
    parser.add_argument("--dry-run", action="store_true", help="仅校验，不写入文件（也不跑 npm build）。")
    parser.add_argument("--no-web", action="store_true", help="跳过 web 日历仪表盘的构建。")
    args = parser.parse_args()

    data, food_db, cfg = load()
    for i, d in enumerate(data):
        validate_meals(d, food_db, i)
        validate_water(d, i)
    validate_targets(data, cfg)

    write_intake(data, dry_run=args.dry_run)
    inject_html(data, cfg, dry_run=args.dry_run)
    n = update_weekly(data, cfg, dry_run=args.dry_run)
    build_web(dry_run=args.dry_run, skip=args.no_web)
    deploy(dry_run=args.dry_run)
    print(f"OK: {len(data)} 条记录 -> nutrition.html {'将' if args.dry_run else '已'}刷新；{n} 个周报{'将' if args.dry_run else '已'}同步。")


if __name__ == "__main__":
    main()
