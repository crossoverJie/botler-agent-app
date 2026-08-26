#!/usr/bin/env python3
"""Travel timeline + map builder + validator (per-day source of truth).

Source of truth: data/days/YYYY-MM-DD.json (one file per day, each { date, events }).
build.py merges all day files into the aggregate data/events.json, validates events
against data/cities.json (vendored city -> province -> lat/lng), and emits
self-contained static pages web/timeline.html and web/map.html (Python stdlib only).

Travel spend lives in the sibling `ledger` project; when it exists, ledger.json
is read (cross-project, non-blocking) so the timeline can show per-day / per-trip
travel expenses joined via the `旅行:<行程名>` tag.

For queries, use --report: prints a text summary so the agent does NOT need to
read raw data files (bounded tokens regardless of how many trips are recorded).

Usage:
    python3 scripts/build.py                  # merge + validate + refresh web/*.html
    python3 scripts/build.py --dry-run        # merge + validate only, no writes
    python3 scripts/build.py --report 2026-08-23        # list that day's events
    python3 scripts/build.py --report 行程:2026北京     # trip summary (incl. ledger spend)
    python3 scripts/build.py --report 城市             # visited cities + provinces
"""
import argparse
import glob
import html
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DAYS_DIR = os.path.join(ROOT, "data", "days")
EVENTS = os.path.join(ROOT, "data", "events.json")
CITIES = os.path.join(ROOT, "data", "cities.json")
PHOTOS = os.path.join(ROOT, "photos")
TIMELINE = os.path.join(ROOT, "web", "timeline.html")
MAP = os.path.join(ROOT, "web", "map.html")
LEDGER = os.path.join(ROOT, "..", "ledger", "data", "ledger.json")

# China approximate bounding box for the SVG scatter map.
LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX = 18.0, 54.0, 73.0, 135.0
SVG_W, SVG_H = 900, 580

SUFFIXES = ("省", "市", "自治区", "特别行政区")


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
    """读取 data/days/*.json 合并为事件数组(只读)。文件名必须是 日期.json 且与内部 date 一致。"""
    files = sorted(glob.glob(os.path.join(DAYS_DIR, "*.json")))
    files = [f for f in files if not f.endswith(".sample.json")]
    events = []
    if not files:
        warn("data/days/ 为空(新项目首次运行属正常;若有历史数据被清空,请用 git 恢复)。")
        return events
    for path in files:
        d = read_json(path)
        if not isinstance(d, dict) or "date" not in d or "events" not in d:
            fail(f"{os.path.basename(path)} 应为 {{ date, events }} 结构。")
        if not isinstance(d["events"], list):
            fail(f"{os.path.basename(path)} 的 events 应为数组。")
        if os.path.basename(path) != f"{d['date']}.json":
            fail(f"{os.path.basename(path)} 的文件名与其内部 date({d['date']}) 不一致。")
        events.extend(d["events"])
    return events


def load_cities():
    cities = read_json(CITIES)
    if not isinstance(cities, dict) or "cities" not in cities or not isinstance(cities["cities"], list):
        fail("cities.json 顶层应为对象且包含 cities 数组。")
    return cities["cities"]


def normalize(name):
    """去掉省/市/自治区/特别行政区后缀,用于城市名匹配。"""
    s = str(name).strip()
    for suf in SUFFIXES:
        if s.endswith(suf):
            s = s[: -len(suf)]
            break
    return s


def load_ledger():
    """非阻断读取 ../ledger/data/ledger.json,聚合 旅行: 标签的花费。"""
    if not os.path.exists(LEDGER):
        return {}, {}
    try:
        with open(LEDGER, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        warn(f"读取 {LEDGER} 失败,时间线将不显示旅行花费。")
        return {}, {}
    trip_tot = defaultdict(int)
    day_tot = defaultdict(int)
    for r in data.get("records", []):
        if not isinstance(r, dict) or r.get("type") != "expense":
            continue
        amt = r.get("amount_cents")
        if not isinstance(amt, int) or isinstance(amt, bool) or amt <= 0:
            continue
        day = str(r.get("date", ""))[:10]
        for t in r.get("tags") or []:
            if isinstance(t, str) and t.startswith("旅行:") and t[3:].strip():
                trip_tot[t[3:]] += amt
                day_tot[day] += amt
    return trip_tot, day_tot


def validate(events, cities):
    seen_ids = set()
    for i, e in enumerate(events):
        where = f"第 {i} 条事件"
        if not isinstance(e, dict):
            fail(f"{where}应为对象。")
        eid = e.get("id")
        if not isinstance(eid, str) or not eid:
            fail(f"{where}({e})缺少字符串 id。")
        if eid in seen_ids:
            fail(f"id 重复:{eid}")
        seen_ids.add(eid)

        at = e.get("at")
        if not isinstance(at, str) or not at:
            fail(f"{eid}:at 应为 ISO 8601 字符串(含时区)。")
        try:
            datetime.fromisoformat(at)
        except ValueError:
            fail(f"{eid}:at 非法时间 {at!r}。")

        for field in ("city", "text"):
            if not isinstance(e.get(field), str) or not e[field].strip():
                fail(f"{eid}:{field} 应为非空字符串。")
        if e.get("place") is not None and not isinstance(e["place"], str):
            fail(f"{eid}:place 应为字符串。")
        if e.get("trip") is not None and not isinstance(e["trip"], str):
            fail(f"{eid}:trip 应为字符串。")

        imgs = e.get("images") or []
        if not isinstance(imgs, list):
            fail(f"{eid}:images 应为数组。")
        for p in imgs:
            if not isinstance(p, str) or not p:
                fail(f"{eid}:images 元素应为非空字符串。")
            full = os.path.join(ROOT, p)
            if not os.path.exists(full):
                warn(f"{eid}:图片引用不存在:{p}")

    # 城市匹配(唯一城市名,先归一化再匹配)
    city_idx = {normalize(c.get("city")): c for c in cities if isinstance(c, dict) and c.get("city")}
    seen = set()
    for e in events:
        city = normalize(e.get("city", ""))
        if city and city not in city_idx:
            warn(f"城市 {e.get('city')!r} 不在 cities.json 中,地图将跳过(可补进 cities.json)。")
        seen.add(city)
    return seen


def orphan_photos(events):
    """列出 photos/ 中未被任何事件引用的文件。"""
    referenced = set()
    for e in events:
        for p in (e.get("images") or []):
            if isinstance(p, str):
                referenced.add(os.path.basename(p))
    orphans = []
    if os.path.isdir(PHOTOS):
        img_exts = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")
        for p in sorted(glob.glob(os.path.join(PHOTOS, "*"))):
            base = os.path.basename(p)
            if base.startswith("."):
                continue
            if not base.lower().endswith(img_exts):
                continue
            if base not in referenced:
                orphans.append(base)
    return orphans


def write_aggregate(events, dry_run=False):
    """幂等写回 data/events.json(聚合产物,唯一真相源是 data/days/)。"""
    events = sorted(events, key=lambda e: (e.get("at", ""), e.get("id", "")))
    content = json.dumps({"version": 1, "events": events}, ensure_ascii=False, indent=2) + "\n"
    if os.path.exists(EVENTS):
        try:
            with open(EVENTS, encoding="utf-8") as f:
                if json.load(f).get("events") == events:
                    return
        except json.JSONDecodeError:
            pass
    if dry_run:
        print(f"[dry-run] 将写入 {EVENTS}")
        return
    with open(EVENTS, "w", encoding="utf-8") as f:
        f.write(content)


def esc(s):
    return html.escape(str(s), quote=False)


def fmt(cents):
    return f"{cents / 100:.2f}"


# ---------------------------------------------------------------- dashboard


def render_timeline(events, trip_tot, day_tot, orphan):
    by_day = defaultdict(list)
    for e in events:
        dt = datetime.fromisoformat(e["at"])
        by_day[dt.date().isoformat()].append((dt, e))
    days = sorted(by_day, reverse=True)

    parts = [
        "<!DOCTYPE html>",
        '<html lang="zh-CN"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>旅行时间线</title><style>",
        "body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;margin:0;background:#f5f6f8;color:#222}",
        "header{padding:18px 24px;background:#fff;border-bottom:1px solid #e3e5e8}",
        "h1{font-size:20px;margin:0}h1 small{color:#888;font-weight:normal}",
        "main{padding:20px 24px;max-width:900px;margin:0 auto}",
        ".trip-summary{margin-bottom:18px}",
        ".day{margin-bottom:22px}",
        ".day-head{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}",
        ".day-date{font-size:16px;font-weight:600}",
        ".day-cost{color:#e0563a;font-size:13px}",
        ".event{background:#fff;border-radius:10px;padding:12px 16px;margin-bottom:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
        ".event-time{color:#999;font-size:12px}.event-meta{color:#888;font-size:12px;margin-left:8px}",
        ".event-text{margin-top:6px;line-height:1.6;white-space:pre-wrap}",
        ".imgs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}",
        ".imgs img{max-height:160px;border-radius:8px;max-width:100%}",
        ".empty{padding:40px;text-align:center;color:#999;background:#fff;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
        ".orphan{color:#b58900;font-size:13px;margin-top:16px}",
        "</style></head><body>",
        "<header><h1>旅行时间线 <small>travel/data/days/</small></h1></header><main>",
    ]

    if not events:
        parts.append('<div class="empty">暂无旅行事件。旅行消息路由到本项目后,记录将出现在 data/days/。</div>')
        parts.append("</main></body></html>")
        return "\n".join(parts)

    if trip_tot:
        parts.append('<div class="trip-summary">')
        for trip, amt in sorted(trip_tot.items(), key=lambda kv: -kv[1]):
            parts.append(f"<div>行程 <b>{esc(trip)}</b> 旅行支出合计:¥{fmt(amt)}</div>")
        parts.append("</div>")

    for day in days:
        items = sorted(by_day[day], key=lambda x: x[0])
        cost = day_tot.get(day, 0)
        cost_html = f'<span class="day-cost">当日旅行支出 ¥{fmt(cost)}</span>' if cost else ""
        parts.append(f'<div class="day"><div class="day-head"><span class="day-date">{esc(day)}</span>{cost_html}</div>')
        for dt, e in items:
            time = dt.strftime("%H:%M")
            meta = []
            if e.get("place"):
                meta.append(f"{e['place']} · {e.get('city', '')}")
            elif e.get("city"):
                meta.append(e["city"])
            if e.get("trip"):
                meta.append(e["trip"])
            meta_html = f'<span class="event-meta">{esc(" · ".join(meta))}</span>' if meta else ""
            imgs_html = ""
            if e.get("images"):
                imgs = "".join(
                    f'<img src="{esc(p.replace("photos/", "../photos/", 1))}" alt="{esc(p)}">'
                    for p in e["images"]
                    if isinstance(p, str)
                )
                if imgs:
                    imgs_html = f'<div class="imgs">{imgs}</div>'
            parts.append(
                f'<div class="event"><span class="event-time">{esc(time)}</span>{meta_html}'
                f'<div class="event-text">{esc(e.get("text", ""))}</div>{imgs_html}</div>'
            )
        parts.append("</div>")

    if orphan:
        parts.append(f'<div class="orphan">⚠️ 孤儿图片(未被引用,可清理):{esc("、".join(orphan))}</div>')
    parts.append("</main></body></html>")
    return "\n".join(parts)


def render_map(events, cities):
    city_idx = {normalize(c.get("city")): c for c in cities if isinstance(c, dict) and c.get("city")}
    city_events = Counter(normalize(e.get("city", "")) for e in events if e.get("city"))

    matched = []
    for city, n in sorted(city_events.items(), key=lambda kv: -kv[1]):
        if city in city_idx:
            c = city_idx[city]
            matched.append((c["city"], c["province"], c["lat"], c["lng"], n))

    provinces = defaultdict(int)
    for _, prov, _, _, n in matched:
        provinces[prov] += n

    parts = [
        "<!DOCTYPE html>",
        '<html lang="zh-CN"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>我去过哪些地方</title><style>",
        "body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;margin:0;background:#f5f6f8;color:#222}",
        "header{padding:18px 24px;background:#fff;border-bottom:1px solid #e3e5e8}",
        "h1{font-size:20px;margin:0}h1 small{color:#888;font-weight:normal}",
        "main{padding:20px 24px;max-width:960px;margin:0 auto}",
        "h2{font-size:16px;margin:22px 0 10px}",
        "svg{background:#eef3f8;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
        ".note{color:#999;font-size:12px;margin-top:4px}",
        "table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
        "th,td{padding:8px 12px;text-align:left;font-size:13px;border-bottom:1px solid #f0f1f3}",
        "th{background:#fafbfc;color:#555;font-weight:500}",
        ".empty{padding:40px;text-align:center;color:#999;background:#fff;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
        "</style></head><body>",
        "<header><h1>旅行足迹地图 <small>data/cities.json + data/days/</small></h1></header><main>",
    ]

    if not matched:
        parts.append('<div class="empty">暂无已匹配的城市足迹。事件写入后,地图将在这里渲染。</div>')
        parts.append("</main></body></html>")
        return "\n".join(parts)

    def proj(lat, lng):
        x = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN) * SVG_W
        y = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * SVG_H
        return x, y

    circles = []
    for name, _, lat, lng, n in matched:
        x, y = proj(lat, lng)
        circles.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{4 + min(n, 5)}" fill="#e0563a" opacity="0.85"/>')
        circles.append(f'<text x="{x + 7:.1f}" y="{y + 4:.1f}" font-size="11" fill="#333">{esc(name)}</text>')
    svg = (
        f'<svg viewBox="0 0 {SVG_W} {SVG_H}" width="100%">'
        f"<rect width=\"{SVG_W}\" height=\"{SVG_H}\" rx=\"10\" fill=\"#eef3f8\"/>"
        + "".join(circles)
        + "</svg>"
    )
    parts.append('<h2>城市足迹</h2>')
    parts.append(svg)
    parts.append('<div class="note">地图为经纬度散点示意(中国轮廓图将在后续版本加入);省份/城市明细见下方表格。</div>')

    parts.append('<h2>到访省份</h2><table><tr><th>省份</th><th>事件数</th></tr>')
    for prov, n in sorted(provinces.items(), key=lambda kv: -kv[1]):
        parts.append(f"<tr><td>{esc(prov)}</td><td>{n}</td></tr>")
    parts.append("</table>")

    parts.append('<h2>到访城市</h2><table><tr><th>城市</th><th>省份</th><th>纬度</th><th>经度</th><th>事件数</th></tr>')
    for name, prov, lat, lng, n in matched:
        parts.append(f"<tr><td>{esc(name)}</td><td>{esc(prov)}</td><td>{lat:.4f}</td><td>{lng:.4f}</td><td>{n}</td></tr>")
    parts.append("</table>")

    parts.append("</main></body></html>")
    return "\n".join(parts)


def write_out(path, content, dry_run=False):
    out_dir = os.path.dirname(path)
    if dry_run:
        print(f"[dry-run] 将写入 {path}")
        return
    os.makedirs(out_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


# ---------------------------------------------------------------- report (query)


def run_report(events, q):
    if not events:
        return "暂无旅行事件。"
    q = q.strip()

    if q.startswith("行程:"):
        trip = q[3:].strip()
        rs = [e for e in events if e.get("trip") == trip]
        if not rs:
            return f"未找到行程 {trip} 的事件。"
        days = sorted(set(e["at"][:10] for e in rs))
        cities = "、".join(sorted(set(e.get("city", "") for e in rs if e.get("city"))))
        lines = [
            f"行程「{trip}」: {len(rs)} 条事件, 覆盖 {len(days)} 天({days[0]} ~ {days[-1]})",
            f"到访城市: {cities}",
        ]
        trip_tot, _ = load_ledger()
        if trip in trip_tot:
            lines.append(f"旅行支出(来自 ledger): ¥{fmt(trip_tot[trip])}")
        return "\n".join(lines)

    if q == "城市" or q == "足迹":
        cities = Counter(e.get("city", "") for e in events if e.get("city"))
        return "到访城市:\n" + "\n".join(f"  {c} ×{n}" for c, n in sorted(cities.items(), key=lambda kv: -kv[1]))

    if len(q) == 10 and q[4] == "-" and q[7] == "-":
        rs = sorted([e for e in events if e["at"][:10] == q], key=lambda e: e["at"])
        if not rs:
            return f"{q} 没有事件。"
        lines = [f"{q} 共 {len(rs)} 条事件:"]
        for e in rs:
            time = e["at"][11:16]
            place = f"{e.get('place', '')} · " if e.get("place") else ""
            trip = f" [{e['trip']}]" if e.get("trip") else ""
            lines.append(f"  {time} {place}{e.get('city', '')}{trip} — {e.get('text', '')}")
        return "\n".join(lines)

    return "支持的 --report 查询:<日期 YYYY-MM-DD> / 行程:<行程名> / 城市\n" f"未识别的查询:{q}"


def main():
    parser = argparse.ArgumentParser(description="旅行:合并 data/days/ → 校验 → 时间线/地图 / 文本报告。")
    parser.add_argument("--dry-run", action="store_true", help="仅校验,不写入文件。")
    parser.add_argument("--report", nargs="+", metavar="QUERY", help="文本查询(只读,不写文件),如:2026-08-23 / 行程:2026北京 / 城市")
    args = parser.parse_args()

    events = merge_days()
    cities = load_cities()
    validate(events, cities)

    if args.report:
        print(run_report(events, " ".join(args.report)))
        return

    orphan = orphan_photos(events)
    if orphan:
        warn(f"孤儿图片(未被引用,可清理):{'、'.join(orphan)}")

    trip_tot, day_tot = load_ledger()
    if trip_tot and not args.dry_run:
        print(f"=> 已从 ledger 关联旅行花费:{'、'.join(f'{k} ¥{fmt(v)}' for k, v in trip_tot.items())}")

    write_aggregate(events, dry_run=args.dry_run)
    write_out(TIMELINE, render_timeline(events, trip_tot, day_tot, orphan), dry_run=args.dry_run)
    write_out(MAP, render_map(events, cities), dry_run=args.dry_run)
    n = len(events)
    print(f"OK: {n} 条事件校验通过(合并自 data/days/),web/timeline.html / web/map.html {'将' if args.dry_run else '已'}刷新。")


if __name__ == "__main__":
    main()
