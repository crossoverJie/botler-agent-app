#!/usr/bin/env python3
"""训记训练数据（train skill）：读取/写回训练 + 官方计划。

用法:
  python3 scripts/train.py query --date YYYY-MM-DD [--full] [--refresh] [--raw]
  python3 scripts/train.py upsert '<res json>' [--full] [--confirm] [--raw]
  python3 scripts/train.py plan list [--raw]
  python3 scripts/train.py plan get --plan-ref platform:155 [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--no-movements] [--raw]

要点:
  - query 默认轻量；需要未打勾组 / RPE / 备注 / 完成感受 / 心率等完整数据时加 --full。
  - query 只缓存严格历史日期；--refresh 强制重新请求训记。
  - upsert 的 res json 可传训练数组或 {"trains":[...]}；最多 4 条训练且必须同一天，每条 ≤15 动作、每动作 ≤20 组。
  - 写回前必须先向用户展示变更摘要并等待确认；用户确认后才加 --confirm 写回。
"""
import argparse
import json
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from cache import cache_label, date_is_history, read_cache, write_cache  # noqa: E402
from xunjiapi import URLS, KEYS, new_client_id, post_json, require_ok, print_json  # noqa: E402

MOVEMENT_UNITS = {"weight": "kg", "unit": "kg"}


def _fmt_set(s):
    if "items" in s and s["items"]:  # 超级组子项
        return "超级组: " + "; ".join(
            f"{it.get('name','')} {it.get('set',{}).get('weight','')}{it.get('set',{}).get('unit','')}x{it.get('set',{}).get('reps','')}"
            for it in s["items"]
        )
    w = s.get("weight") or s.get("weight_kg") or ""
    u = s.get("unit") or "kg"
    reps = s.get("reps") or ""
    t = s.get("time") or s.get("duration_s") or ""
    rpe = s.get("rpe") or ""
    done = "✓" if s.get("done") else "·"
    extra = f" rpe={rpe}" if rpe else ""
    return f"{done} {w}{u} x {reps or t}{extra}"


def _train_cache_name(args):
    variant = "full" if args.full else "light"
    return f"{args.date}.{variant}.json"


def _fetch_train(args):
    payload = {
        "schema_version": "train_open_api_v2",
        "datestr": args.date,
        "include_full_data": args.full,
    }
    data = post_json(URLS["train_query"], payload, KEYS["train"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    res = data.get("res", data)  # 训练接口不强制 success===true
    return res


def _print_train(res, args, cached_meta):
    trains = res.get("trains", []) or []
    line = f"日期: {args.date} | 训练数: {len(trains)}"
    if cached_meta:
        line += f" | 本地缓存 @ {cache_label(cached_meta)}"
    print(line)
    for t in trains:
        start, end = t.get("start"), t.get("end")
        dur = ""
        if start and end:
            dur = f" ({int((end - start) / 60000)} 分钟)"
        note = t.get("note") or ""
        note_str = f" | note: {note}" if note else ""
        print(f"\n=== {t.get('title','(无标题)')}{dur} | localid={t.get('localid')}{note_str}")
        for m in t.get("movements", []):
            sets = m.get("sets", []) or []
            done_count = sum(1 for s in sets if s.get("done"))
            rest = f" | restTime={m.get('restTime')}s" if m.get("restTime") is not None else ""
            print(f"  {m.get('name')} | {len(sets)} 组（已完成 {done_count}）{rest}")
            for s in sets:
                print(f"    {_fmt_set(s)}")
    if not trains:
        print("（该日无训练）")


def cmd_query(args):
    cached_meta = None
    if args.raw:
        res = _fetch_train(args)
        if date_is_history(args.date):
            write_cache("train", _train_cache_name(args), res)
        print_json(res, raw=True)
        return

    if not args.refresh and date_is_history(args.date):
        cached_meta = read_cache("train", _train_cache_name(args))

    if cached_meta is not None:
        res = cached_meta["payload"]
    else:
        res = _fetch_train(args)
        if date_is_history(args.date):
            write_cache("train", _train_cache_name(args), res)

    _print_train(res, args, cached_meta)


def cmd_upsert(args):
    try:
        res_data = json.loads(args.res)
    except Exception as e:
        print(f"res 不是合法 JSON: {e}")
        sys.exit(1)
    payload = {
        "schema_version": "train_open_api_v2",
        "client_request_id": new_client_id("train"),
        "dry_run": not args.confirm,
        "include_full_data": args.full,
        "res": res_data,
    }
    data = post_json(URLS["train_upsert"], payload, KEYS["train"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    if args.raw:
        print_json(data, raw=True)
        return
    res = data.get("res", data)
    if args.confirm:
        print("已写回训练。服务端返回的标准数据如下：")
    else:
        print("=== 校验结果（dry_run，未真正写回）===")
    print_json(res, raw=True)


def cmd_plan_list(args):
    data = post_json(URLS["plan_query"], {"schema_version": "plan_open_api_v1", "action": "list"}, KEYS["train"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    res = data.get("res", {})
    if args.raw:
        print_json(res, raw=True)
        return
    plans = res.get("plans", []) or []
    print(f"官方计划数: {len(plans)}")
    for pl in plans:
        print(f"  plan_ref: {pl.get('plan_ref')} | {pl.get('name','')} | {pl.get('type','')}")


def cmd_plan_get(args):
    payload = {
        "schema_version": "plan_open_api_v1",
        "action": "get",
        "plan_ref": args.plan_ref,
        "include_movements": not args.no_movements,
    }
    if args.start:
        payload["start_date"] = args.start
    if args.end:
        payload["end_date"] = args.end
    data = post_json(URLS["plan_query"], payload, KEYS["train"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    res = data.get("res", {})
    if args.raw:
        print_json(res, raw=True)
        return
    plan = res.get("plan", {})
    dr = res.get("date_range", {})
    days = res.get("days", []) or []
    print(f"计划: {plan.get('name','')} | 范围: {dr.get('start_date','')} ~ {dr.get('end_date','')} | 天数: {len(days)}")
    for d in days:
        print(f"\n{d.get('date')} | {d.get('title','')}")
        for m in d.get("movements", []):
            print(f"  - {m.get('name','')} | {m.get('target','')}")


def main():
    p = argparse.ArgumentParser(description="训记训练数据")
    sub = p.add_subparsers(dest="cmd", required=True)

    q = sub.add_parser("query", help="读取某天训练")
    q.add_argument("--date", required=True)
    q.add_argument("--full", action="store_true", help="返回完整数据（RPE/未打勾/心率等）")
    q.add_argument("--refresh", action="store_true", help="忽略本地历史缓存，强制重新请求训记")
    q.add_argument("--raw", action="store_true")
    q.set_defaults(fn=cmd_query)

    u = sub.add_parser("upsert", help="写回训练")
    u.add_argument("res", help="训练数组 或 {\"trains\":[...]} JSON")
    u.add_argument("--full", action="store_true")
    u.add_argument("--confirm", action="store_true", help="用户确认后真正写回")
    u.add_argument("--raw", action="store_true")
    u.set_defaults(fn=cmd_upsert)

    pl = sub.add_parser("plan", help="官方计划")
    pl_sub = pl.add_subparsers(dest="plan_cmd", required=True)
    pls = pl_sub.add_parser("list")
    pls.add_argument("--raw", action="store_true")
    pls.set_defaults(fn=cmd_plan_list)
    plg = pl_sub.add_parser("get")
    plg.add_argument("--plan-ref", required=True, help="如 platform:155 / universal:155")
    plg.add_argument("--start")
    plg.add_argument("--end")
    plg.add_argument("--no-movements", action="store_true", help="只要日历不要动作")
    plg.add_argument("--raw", action="store_true")
    plg.set_defaults(fn=cmd_plan_get)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
