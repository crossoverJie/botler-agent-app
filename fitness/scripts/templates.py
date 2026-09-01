#!/usr/bin/env python3
"""训记 Agent 个人模板（personal-template skill）：增量同步 / 新建或更新模板。

用法:
  python3 scripts/templates.py sync [--cursor N] [--include-content] [--raw]
  python3 scripts/templates.py mutate '<payload json>' [--confirm] [--raw]

要点:
  - 只允许 1 个专属文件夹，最多 14 个有效模板，每模板 ≤15 动作、每动作 ≤20 组；超限必须询问用户。
  - sync 用 cursor 增量拉取；把返回的 next_cursor 持久保存，同一任务内不要重复全量请求。
  - mutate 是写操作：先展示摘要（文件夹改名 / 模板名 / 动作 / 组数 / 递增规则）等用户确认，确认后才 --confirm（带 confirmed:true 与唯一 mutation_id）。
  - mutate payload: {folder_update?:{name,base_version}, upserts:[...], deletes:[...]}。
"""
import argparse
import json
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from xunjiapi import URLS, KEYS, new_client_id, post_json, require_ok, print_json  # noqa: E402


def cmd_sync(args):
    payload = {"cursor": args.cursor, "limit": 15, "include_content": args.include_content}
    data = post_json(URLS["tpl_sync"], payload, KEYS["tpl"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    res = data.get("res", data)
    if args.raw:
        print_json(res, raw=True)
        return
    folder = res.get("folder") or {}
    limits = res.get("limits") or {}
    changes = res.get("changes") or []
    print(f"next_cursor: {res.get('next_cursor')} | has_more: {res.get('has_more')} | revision: {res.get('current_revision')}")
    if folder:
        print(f"文件夹: {folder.get('name')} (unique_id={folder.get('unique_id')}, version={folder.get('version')}, max_templates={folder.get('max_templates')})")
    if limits:
        print(f"限制: {json.dumps(limits, ensure_ascii=False)}")
    print(f"变更数: {len(changes)}")
    for c in changes:
        etype = c.get("entity_type")
        op = c.get("operation")
        ent_id = c.get("entity_id", "")
        d = c.get("data", {}) or {}
        if op == "delete":
            print(f"  [删除] {etype} entity_id={ent_id}")
            continue
        if etype == "folder":
            print(f"  [文件夹] {d.get('name')} (unique_id={d.get('unique_id')}, version={d.get('version')}, agent_managed={d.get('agent_managed')})")
            continue
        # template
        name = d.get("name", "")
        ver = d.get("version", "")
        movements = d.get("movements", []) or []
        prog = d.get("progression") or d.get("rules")
        print(f"  [模板] {name} (entity_id={ent_id}, version={ver})")
        if movements:
            print(f"      动作: {len(movements)} 个 | {', '.join(m.get('name', '') for m in movements[:6])}")
        if prog:
            print(f"      规则: {json.dumps(prog, ensure_ascii=False)}")
    if not changes:
        print("（无变更）")


def cmd_mutate(args):
    try:
        payload = json.loads(args.payload)
    except Exception as e:
        print(f"payload 不是合法 JSON: {e}")
        sys.exit(1)
    payload["confirmed"] = bool(args.confirm)
    payload.setdefault("mutation_id", new_client_id("tpl-mutate"))
    payload.setdefault("upserts", [])
    payload.setdefault("deletes", [])
    data = post_json(URLS["tpl_mutate"], payload, KEYS["tpl"])
    ok, msg = require_ok(data)
    if not ok:
        print(msg)
        sys.exit(1)
    res = data.get("res", data)
    if args.raw:
        print_json(data, raw=True)
        return
    if args.confirm:
        print("已应用模板变更。应用结果如下：")
    else:
        print("=== 未确认（confirmed=false），仅返回当前状态，未做任何变更 ===")
    applied = res.get("applied", []) if isinstance(res, dict) else []
    if isinstance(applied, list):
        for a in applied:
            d = a.get("data", {})
            print(f"  template_id={a.get('template_id')} name={d.get('name','')} 动作={len(d.get('movements', []))} 个")
    print(f"next_cursor: {(res.get('next_cursor') if isinstance(res, dict) else '')}")
    if not args.confirm:
        print("\n用户确认后，用相同 payload 加 --confirm 重试（mutation_id 保持不变）。")


def main():
    p = argparse.ArgumentParser(description="训记 Agent 个人模板")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sync", help="增量同步")
    s.add_argument("--cursor", type=int, default=0)
    s.add_argument("--include-content", action="store_true")
    s.add_argument("--raw", action="store_true")
    s.set_defaults(fn=cmd_sync)

    m = sub.add_parser("mutate", help="新建/更新/删除模板（写操作）")
    m.add_argument("payload", help="mutate payload JSON")
    m.add_argument("--confirm", action="store_true", help="用户确认后真正应用")
    m.add_argument("--raw", action="store_true")
    m.set_defaults(fn=cmd_mutate)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
