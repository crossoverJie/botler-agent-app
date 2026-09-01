#!/usr/bin/env python3
"""训记饮食数据（diet skill）：查询 / 搜索食物 / 写回 / 自定义食物 / 模板。

用法:
  python3 scripts/diet.py query --start YYYY-MM-DD --end YYYY-MM-DD [--no-detail] [--refresh] [--raw]
  python3 scripts/diet.py search --kw 鸡蛋 [--limit 8] [--raw]
  python3 scripts/diet.py upsert '<foods json>' [--confirm] [--raw]
  python3 scripts/diet.py custom '<food json>' [--confirm] [--raw]
  python3 scripts/diet.py tpl-list [--raw]
  python3 scripts/diet.py tpl-apply '<payload json>' [--confirm] [--raw]

要点:
  - 查询日期限制：过去一年 ~ 未来 3 个月。
  - 写回前必须先展示摘要（日期/餐次/食物/数量/单位）并等待用户确认，确认后才 --confirm。
  - upsert 的 foods: [{date, meal_type, name, amount, unit, uniquekey, ntr:{cal,protein,fat,carb}}]
  - 官方食物写回前先 search 拿 uniquekey；搜索不到才创建 custom 食物。
  - query 只缓存严格历史日期；--refresh 强制重新请求训记。
"""
import argparse
import json
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from cache import cache_label, date_is_history, iter_dates, read_cache, write_cache  # noqa: E402
from xunjiapi import URLS, KEYS, new_client_id, post_json, require_ok, print_json  # noqa: E402

MEAL_LABELS = {"breakfast": "早餐", "lunch": "午餐", "dinner": "晚餐", "snack": "加餐"}
DIET_WINDOW_TTL = 60 * 60


def _meal(mt):
    return MEAL_LABELS.get(mt, mt)


def _diet_request(args, start, end, include_detail):
    payload = {"start_date": start, "end_date": end, "include_detail": include_detail}
    data = post_json(URLS["diet_query"], payload, KEYS["diet"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    if data.get("success") is False:
        print("查询失败:", json.dumps(data.get("res"), ensure_ascii=False))
        sys.exit(1)
    res = data.get("res", {})
    return res


def _write_diet_history_cache(res, history_dates, domain):
    day_map = {}
    for day in res.get("days", []) or []:
        datestr = day.get("date") or day.get("datestr")
        if datestr:
            day_map[datestr] = day
    for datestr in history_dates:
        payload = day_map.get(datestr, {"date": datestr, "empty": True})
        write_cache(domain, f"{datestr}.json", payload)


def _collect_diet_days(cached_days):
    days = []
    for datestr in sorted(cached_days, reverse=True):
        day = cached_days[datestr]
        if not day.get("empty"):
            days.append(day)
    return days


def _day_date(day):
    return day.get("date") or day.get("datestr") or ""


def _print_diet(res, args, cached_meta):
    days = res.get("days", []) or []
    win = res.get("window", {}) or {}
    line = f"日期范围: {args.start} ~ {args.end} | 天数: {len(days)} | 可用窗口: {win.get('minDate','')} ~ {win.get('maxDate','')}"
    if cached_meta:
        line += f" | 本地缓存 @ {cache_label(cached_meta)}"
    print(line)
    for d in days:
        date = d.get("date", d.get("datestr", "?"))
        print(f"\n=== {date} ===")
        # 按餐次展示
        meals = d.get("meals") or d.get("foods") or {}
        if isinstance(meals, dict):
            for meal_name, items in meals.items():
                if isinstance(items, list):
                    print(f"  [{meal_name}]")
                    for it in items:
                        if isinstance(it, dict):
                            print(f"    - {it.get('name','')} {it.get('amount','')}{it.get('unit','')} | {it.get('cal','')}kcal P{it.get('protein','')} F{it.get('fat','')} C{it.get('carb','')}")
                        else:
                            print(f"    - {it}")
                else:
                    print(f"  [{meal_name}] {items}")
        elif isinstance(meals, list):
            for it in meals:
                print(f"  - {it}")
        # 顶层汇总
        for k in ("calories", "protein", "fat", "carb"):
            if k in d:
                print(f"  {k}: {d[k]}")
    if not days:
        print("（该范围无饮食记录）")


def cmd_query(args):
    include_detail = not args.no_detail
    domain = "diet_summary" if args.no_detail else "diet_detail"

    if args.raw:
        res = _diet_request(args, args.start, args.end, include_detail)
        print_json(res, raw=True)
        return

    dates = iter_dates(args.start, args.end)
    history_dates = [d for d in dates if date_is_history(d)]
    live_dates = [d for d in dates if not date_is_history(d)]

    cached_days = {}
    days_complete = True
    if history_dates and not args.refresh:
        for datestr in history_dates:
            hit = read_cache(domain, f"{datestr}.json")
            if hit is None:
                days_complete = False
                break
            cached_days[datestr] = hit["payload"]
    elif history_dates:
        days_complete = False

    window_hit = None
    if not args.refresh:
        window_hit = read_cache("diet_window", "window.json", ttl=DIET_WINDOW_TTL)
    window_ready = window_hit is not None

    if not args.refresh and not live_dates and days_complete and window_ready:
        res = {
            "days": _collect_diet_days(cached_days),
            "window": window_hit["payload"].get("window", {}),
        }
        _print_diet(res, args, window_hit)
        return

    days = []
    window = {}
    if history_dates:
        if args.refresh or not days_complete:
            res_history = _diet_request(args, history_dates[0], history_dates[-1], include_detail)
            days.extend(res_history.get("days", []) or [])
            window = res_history.get("window", {}) or window
            _write_diet_history_cache(res_history, history_dates, domain)
        else:
            days.extend(_collect_diet_days(cached_days))

    if live_dates:
        res_live = _diet_request(args, live_dates[0], live_dates[-1], include_detail)
        days.extend(res_live.get("days", []) or [])
        window = res_live.get("window", {}) or window
        write_cache("diet_window", "window.json", {"window": window})
    elif not window:
        res_full = _diet_request(args, args.start, args.end, include_detail)
        days = res_full.get("days", []) or []
        window = res_full.get("window", {}) or {}
        _write_diet_history_cache(res_full, history_dates, domain)
        write_cache("diet_window", "window.json", {"window": window})
    else:
        write_cache("diet_window", "window.json", {"window": window})

    days.sort(key=_day_date, reverse=True)
    res = {"days": days, "window": window}
    _print_diet(res, args, None)


def cmd_search(args):
    payload = {"keyword": args.kw, "limit": args.limit}
    data = post_json(URLS["food_search"], payload, KEYS["search"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    res = data.get("res", {})
    if args.raw:
        print_json(res, raw=True)
        return
    foods = res.get("foods", []) or []
    d = res.get("d", []) or []
    print(f"关键词「{args.kw}」搜索结果: {len(foods)} 条")
    for f in foods:
        ntr = f.get("ntr", {})
        print(f"  - {f.get('name','')} | 每100g: {ntr.get('cal','')}kcal P{ntr.get('protein','')} F{ntr.get('fat','')} C{ntr.get('carb','')} | uniquekey={f.get('uniquekey','')}")
    if not foods:
        print("（无结果，考虑创建自定义食物）")


def cmd_upsert(args):
    try:
        foods = json.loads(args.foods)
    except Exception as e:
        print(f"foods 不是合法 JSON: {e}")
        sys.exit(1)
    payload = {
        "client_request_id": new_client_id("diet"),
        "dry_run": not args.confirm,
        "foods": foods,
    }
    data = post_json(URLS["diet_upsert"], payload, KEYS["diet"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    if args.raw:
        print_json(data, raw=True)
        return
    print("已写回饮食记录。" if args.confirm else "=== 校验结果（dry_run，未真正写回）===")
    print_json(data.get("res", data), raw=True)


def cmd_custom(args):
    try:
        food = json.loads(args.food)
    except Exception as e:
        print(f"food 不是合法 JSON: {e}")
        sys.exit(1)
    payload = {"client_request_id": new_client_id("food"), "dry_run": not args.confirm, "food": food}
    data = post_json(URLS["diet_custom"], payload, KEYS["diet"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    if args.raw:
        print_json(data, raw=True)
        return
    print("已创建/更新自定义食物。" if args.confirm else "=== 校验结果（dry_run，未真正创建）===")
    print_json(data.get("res", data), raw=True)


def cmd_tpl_list(args):
    data = post_json(URLS["diet_tpl_list"], {"client_request_id": new_client_id("tpl")}, KEYS["diet"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    res = data.get("res", {})
    if args.raw:
        print_json(res, raw=True)
        return
    tpls = res.get("templates", []) if isinstance(res, dict) else res
    print(f"饮食模板数: {len(tpls) if isinstance(tpls, list) else '?'}")
    print_json(tpls, raw=True)


def cmd_tpl_apply(args):
    try:
        payload = json.loads(args.payload)
    except Exception as e:
        print(f"payload 不是合法 JSON: {e}")
        sys.exit(1)
    payload.setdefault("client_request_id", new_client_id("tpl"))
    payload["dry_run"] = not args.confirm
    data = post_json(URLS["diet_tpl_apply"], payload, KEYS["diet"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    if args.raw:
        print_json(data, raw=True)
        return
    print("已套用饮食模板。" if args.confirm else "=== 校验结果（dry_run，未真正套用）===")
    print_json(data.get("res", data), raw=True)


def main():
    p = argparse.ArgumentParser(description="训记饮食数据")
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("query", help="查询饮食记录")
    q.add_argument("--start", required=True)
    q.add_argument("--end", required=True)
    q.add_argument("--no-detail", action="store_true")
    q.add_argument("--refresh", action="store_true", help="忽略本地历史缓存，强制重新请求训记")
    q.add_argument("--raw", action="store_true")
    q.set_defaults(fn=cmd_query)

    s = sub.add_parser("search", help="搜索官方食物")
    s.add_argument("--kw", required=True)
    s.add_argument("--limit", type=int, default=8)
    s.add_argument("--raw", action="store_true")
    s.set_defaults(fn=cmd_search)

    u = sub.add_parser("upsert", help="写回饮食记录")
    u.add_argument("foods", help="foods JSON 数组")
    u.add_argument("--confirm", action="store_true")
    u.add_argument("--raw", action="store_true")
    u.set_defaults(fn=cmd_upsert)

    c = sub.add_parser("custom", help="创建/更新自定义食物")
    c.add_argument("food", help="food JSON")
    c.add_argument("--confirm", action="store_true")
    c.add_argument("--raw", action="store_true")
    c.set_defaults(fn=cmd_custom)

    tl = sub.add_parser("tpl-list", help="查询饮食模板")
    tl.add_argument("--raw", action="store_true")
    tl.set_defaults(fn=cmd_tpl_list)

    ta = sub.add_parser("tpl-apply", help="套用饮食模板")
    ta.add_argument("payload", help="模板 payload JSON")
    ta.add_argument("--confirm", action="store_true")
    ta.add_argument("--raw", action="store_true")
    ta.set_defaults(fn=cmd_tpl_apply)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
