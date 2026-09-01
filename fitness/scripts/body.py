#!/usr/bin/env python3
"""训记身体数据（health skill）：查询 / 写入。

用法:
  python3 scripts/body.py query [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--types weight,bodyfat] [--latest-only] [--refresh] [--raw]
  python3 scripts/body.py upsert '<records json>' [--dry-run] [--confirm] [--raw]

records json 示例:
  [{"datestr":"2026-08-31","type":"weight","value":69.0},
   {"datestr":"2026-08-31","type":"bodyfat","value":18.2}]

写入流程（务必遵守）:
  1. 先 --dry-run 校验并把 res.summary 展示给用户，等待明确确认；
  2. 用户确认后，才加 --confirm 真正写入（服务端要求 confirmed:true）。

query 只缓存严格历史日期；--refresh 强制重新请求训记。
"""
import argparse
import json
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from cache import cache_label, date_is_history, iter_dates, read_cache, write_cache  # noqa: E402
from xunjiapi import URLS, KEYS, new_client_id, post_json, require_ok, print_json  # noqa: E402


BODY_LATEST_TTL = 15 * 60


def _type_list(args):
    types = args.types.split(",") if args.types else []
    return [t.strip() for t in types if t.strip()]


def _type_key(types):
    return ",".join(sorted(types)) if types else "all"


def _body_request(args, start, end, include_latest, include_records):
    types = _type_list(args)
    payload = {
        "start_date": start,
        "end_date": end,
        "include_latest": include_latest,
        "include_records": include_records,
        "limit": args.limit,
        "offset": 0,
    }
    if types:
        payload["types"] = types
    data = post_json(URLS["body_query"], payload, KEYS["body"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    if data.get("success") is False:
        print("查询失败:", json.dumps(data.get("res"), ensure_ascii=False))
        sys.exit(1)
    res = data.get("res", {})
    return res


def _write_body_history_cache(res, history_dates, type_key):
    meta = res.get("type_metadata", {})
    records_by_date = {}
    for record in res.get("records", []) or []:
        datestr = record.get("datestr")
        if datestr:
            records_by_date.setdefault(datestr, []).append(record)
    for datestr in history_dates:
        payload = {
            "records": records_by_date.get(datestr, []),
            "type_metadata": meta,
        }
        write_cache("body_records", f"{datestr}.{type_key}.json", payload)


def _merge_body_cache(cached_history, latest_payload):
    records = []
    meta = {}
    for datestr in sorted(cached_history, reverse=True):
        payload = cached_history[datestr]
        records.extend(payload.get("records", []) or [])
        if not meta:
            meta = payload.get("type_metadata", {})
    latest = (latest_payload or {}).get("latest", {})
    return {
        "type_metadata": meta,
        "latest": latest,
        "records": records,
    }


def _print_body(res, args, cached_meta):
    meta = res.get("type_metadata", {})
    latest = res.get("latest", {}) or {}
    records = res.get("records", []) or []
    line = f"日期范围: {args.start} ~ {args.end}"
    if cached_meta:
        line += f" | 本地缓存 @ {cache_label(cached_meta)}"
    print(line)
    print(f"记录数: {len(records)}")
    if latest:
        print("\n[最新记录]")
        for t, rec in latest.items():
            m = meta.get(t, {})
            print(f"  {m.get('label', t)} ({t}): {rec.get('value')} {m.get('unit', rec.get('unit', ''))}  @ {rec.get('datestr')}")
    if records:
        print("\n[记录明细]")
        for r in records:
            m = meta.get(r.get("type"), {})
            print(f"  {r.get('datestr')}  {m.get('label', r.get('type'))}: {r.get('value')} {m.get('unit', r.get('unit', ''))}")
    if not latest and not records:
        print("（无数据）")


def cmd_query(args):
    include_latest = not args.latest_only
    include_records = not args.latest_only
    types = _type_list(args)
    type_key = _type_key(types)

    if args.raw:
        res = _body_request(args, args.start, args.end, include_latest, include_records)
        print_json(res, raw=True)
        return

    if args.latest_only:
        res = _body_request(args, args.start, args.end, True, False)
        write_cache("body_latest", f"{type_key}.json", {
            "latest": res.get("latest", {}),
            "type_metadata": res.get("type_metadata", {}),
        })
        _print_body(res, args, None)
        return

    dates = iter_dates(args.start, args.end)
    history_dates = [d for d in dates if date_is_history(d)]
    live_dates = [d for d in dates if not date_is_history(d)]

    cached_history = {}
    history_complete = True
    if history_dates and not args.refresh:
        for datestr in history_dates:
            hit = read_cache("body_records", f"{datestr}.{type_key}.json")
            if hit is None:
                history_complete = False
                break
            cached_history[datestr] = hit["payload"]
    elif history_dates:
        history_complete = False

    latest_hit = None
    if include_latest and not args.refresh:
        latest_hit = read_cache("body_latest", f"{type_key}.json", ttl=BODY_LATEST_TTL)
    latest_ready = latest_hit is not None

    if (
        not args.refresh
        and not live_dates
        and history_complete
        and latest_ready
    ):
        res = _merge_body_cache(cached_history, latest_hit["payload"])
        _print_body(res, args, latest_hit)
        return

    records = []
    meta = {}
    if history_dates:
        if args.refresh or not history_complete:
            res_history = _body_request(args, history_dates[0], history_dates[-1], False, True)
            records.extend(res_history.get("records", []) or [])
            meta = res_history.get("type_metadata", {}) or meta
            _write_body_history_cache(res_history, history_dates, type_key)
        else:
            for datestr in history_dates:
                payload = cached_history[datestr]
                records.extend(payload.get("records", []) or [])
                if not meta:
                    meta = payload.get("type_metadata", {})

    latest = {}
    latest_cache_payload = None
    if live_dates:
        res_live = _body_request(args, live_dates[0], live_dates[-1], include_latest, True)
        records.extend(res_live.get("records", []) or [])
        if not meta:
            meta = res_live.get("type_metadata", {})
        if include_latest:
            latest = res_live.get("latest", {})
            latest_cache_payload = {
                "latest": latest,
                "type_metadata": res_live.get("type_metadata", {}) or meta,
            }
            write_cache("body_latest", f"{type_key}.json", latest_cache_payload)
    elif include_latest:
        res_latest = _body_request(args, args.start, args.end, True, False)
        latest = res_latest.get("latest", {})
        latest_cache_payload = {
            "latest": latest,
            "type_metadata": res_latest.get("type_metadata", {}) or meta,
        }
        write_cache("body_latest", f"{type_key}.json", latest_cache_payload)

    records.sort(key=lambda r: r.get("datestr", ""), reverse=True)
    res = {
        "type_metadata": meta,
        "latest": latest,
        "records": records,
    }
    _print_body(res, args, None)


def cmd_upsert(args):
    try:
        records = json.loads(args.records)
    except Exception as e:
        print(f"records 不是合法 JSON: {e}")
        sys.exit(1)
    if not isinstance(records, list) or not records:
        print("records 必须是非空数组")
        sys.exit(1)
    payload = {
        "schema_version": "body_open_api_v1",
        "client_request_id": new_client_id("body"),
        "dry_run": not args.confirm,
        "records": records,
    }
    if args.confirm:
        payload["confirmed"] = True
    data = post_json(URLS["body_upsert"], payload, KEYS["body"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    res = data.get("res", {})
    if args.raw:
        print_json(data, raw=True)
        return
    if args.confirm:
        print("已写入（confirmed）。")
    else:
        print("=== 校验结果（dry_run，未真正写入）===")
    if isinstance(res, dict) and "summary" in res:
        print_json(res["summary"], raw=True)
    else:
        print_json(res, raw=True)


def main():
    p = argparse.ArgumentParser(description="训记身体数据")
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("query", help="查询身体数据")
    q.add_argument("--start", default="2026-01-01")
    q.add_argument("--end", default="2026-12-31")
    q.add_argument("--types", default="", help="逗号分隔，如 weight,bodyfat；留空=全部")
    q.add_argument("--latest-only", action="store_true", help="只看最新记录")
    q.add_argument("--limit", type=int, default=500)
    q.add_argument("--refresh", action="store_true", help="忽略本地历史缓存，强制重新请求训记")
    q.add_argument("--raw", action="store_true")
    q.set_defaults(fn=cmd_query)

    u = sub.add_parser("upsert", help="写入/更新身体数据")
    u.add_argument("records", help="records JSON 数组")
    u.add_argument("--dry-run", action="store_true", help="仅校验（默认就是 dry run，除非 --confirm）")
    u.add_argument("--confirm", action="store_true", help="用户确认后真正写入")
    u.add_argument("--raw", action="store_true")
    u.set_defaults(fn=cmd_upsert)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
