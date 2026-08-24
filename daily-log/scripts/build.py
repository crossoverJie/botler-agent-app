#!/usr/bin/env python3
"""规范化并校验 data/poop.json，刷新 web 仪表盘。

botler-agent 写数据时可能出现形态漂移：records 被折叠成 {item:{...}}、
null 写成字符串 "null"、数字写成字符串、feeling/bristol 超出枚举等。
本脚本是数据落盘后的统一收口：读入 -> 规整成规范 schema -> 幂等写回 ->
尽力刷新 web/dist/index.html（保证 web 永远内联的是最新、正确的数据）。

Usage:
    python3 scripts/build.py           # 规范化 + 写回 + 刷新 web
    python3 scripts/build.py --dry-run # 仅校验/预览，不写文件、不跑 web
    python3 scripts/build.py --no-web  # 跳过 web 构建
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POOP = os.path.join(ROOT, "data", "poop.json")
WEB_DIR = os.path.join(ROOT, "web")

FEELINGS = {"normal", "constipated", "loose", "hard", "bloated", "abdominal_pain"}
KNOWN_FIELDS = {"startedAt", "endedAt", "durationSec", "feeling", "bristol", "note"}

_warn_count = 0


def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg):
    global _warn_count
    _warn_count += 1
    print(f"WARN: {msg}", file=sys.stderr)


def read_json(path):
    if not os.path.exists(path):
        fail(f"找不到文件：{path}")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        fail(f"{path} 不是合法 JSON：{e}")


def parse_dt(s):
    """返回 aware datetime，解析失败返回 None（兼容 ISO 8601，含 Z 后缀）。"""
    if not isinstance(s, str):
        return None
    t = s.strip()
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(t)
    except ValueError:
        return None


def norm_null(v):
    """null / 'null' / '' / 空白 统一为 None，其余原样返回。"""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, str):
        t = v.strip()
        return None if (t == "" or t.lower() == "null") else t
    return v


def norm_int(v):
    """整数归一：int/float/数字字符串 -> int，其余 -> None。"""
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v) if v.is_integer() else None
    if isinstance(v, str):
        t = v.strip()
        if t == "" or t.lower() == "null":
            return None
        try:
            f = float(t)
        except ValueError:
            return None
        return int(f) if f.is_integer() else None
    return None


def flatten_records(node):
    """兼容 records 为数组，或单元素被折叠成 {item:{...}} / {item:[...]} 等形态。"""
    if isinstance(node, list):
        out = []
        for x in node:
            out.extend(flatten_records(x))
        return out
    if isinstance(node, dict):
        if "startedAt" in node:
            return [node]
        out = []
        for v in node.values():
            out.extend(flatten_records(v))
        return out
    return []


def normalize_record(raw, idx):
    """把一条原始记录规整成规范字段；无法规整的返回 None（并告警）。"""
    if not isinstance(raw, dict):
        warn(f"records[{idx}] 不是对象，已跳过。")
        return None

    extra = sorted(set(raw) - KNOWN_FIELDS)
    if extra:
        warn(f"records[{idx}] 含未知字段 {extra}，已忽略。")

    started = norm_null(raw.get("startedAt"))
    if not isinstance(started, str) or not started or parse_dt(started) is None:
        warn(f"records[{idx}] startedAt 非法（{raw.get('startedAt')!r}），已跳过该记录。")
        return None

    ended = norm_null(raw.get("endedAt"))
    if ended is not None and (not isinstance(ended, str) or parse_dt(ended) is None):
        warn(f"records[{idx}] endedAt 非法（{raw.get('endedAt')!r}），置空。")
        ended = None

    feeling = norm_null(raw.get("feeling"))
    if feeling is not None and (not isinstance(feeling, str) or feeling not in FEELINGS):
        warn(f"records[{idx}] feeling 非法（{raw.get('feeling')!r}），置空。")
        feeling = None

    bristol = norm_int(norm_null(raw.get("bristol")))
    if bristol is not None and not (1 <= bristol <= 7):
        warn(f"records[{idx}] bristol 非法（{raw.get('bristol')!r}），置空。")
        bristol = None

    note = raw.get("note")
    note = "" if note is None else (note if isinstance(note, str) else str(note))

    # durationSec 以 endedAt - startedAt 为准（schema 定义），结束时间为空则恒为 null
    duration = None
    if ended is not None:
        s = parse_dt(started)
        e = parse_dt(ended)
        if s is not None and e is not None:
            delta = (e - s).total_seconds()
            if delta < 0:
                warn(f"records[{idx}] endedAt 早于 startedAt，durationSec 置空。")
            else:
                duration = int(round(delta))

    return {
        "startedAt": started,
        "endedAt": ended,
        "durationSec": duration,
        "feeling": feeling,
        "bristol": bristol,
        "note": note,
    }


def load():
    """读入并规整 data/poop.json，返回按 startedAt 升序的记录列表。"""
    raw = read_json(POOP)
    if not isinstance(raw, dict):
        fail("data/poop.json 顶层应为对象 {records: [...]}。")

    raw_records = raw.get("records")
    if raw_records is None:
        raw_records = []
    if not isinstance(raw_records, (list, dict)):
        fail(f"data/poop.json 的 records 应为数组（或 {{item:...}} 折叠形态），实际为 {type(raw_records).__name__}。")

    records = []
    for i, r in enumerate(flatten_records(raw_records)):
        rec = normalize_record(r, i)
        if rec is not None:
            records.append(rec)
    records.sort(key=lambda r: r["startedAt"])
    return records


def write_poop(records, dry_run=False):
    """幂等写回：语义一致则跳过，避免无意义的 git diff。返回是否发生改动。"""
    data = {"records": records}
    content = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if os.path.exists(POOP):
        try:
            with open(POOP, encoding="utf-8") as f:
                if json.load(f) == data:
                    return False
        except json.JSONDecodeError:
            pass  # 磁盘数据损坏时强制重写
    if not dry_run:
        with open(POOP, "w", encoding="utf-8") as f:
            f.write(content)
    return True


def build_web(dry_run=False, skip=False):
    """尽力而为地刷新 web 仪表盘（等价于 ./scripts/build-web.sh）。非阻断。"""
    if skip:
        return
    if not os.path.isdir(WEB_DIR):
        warn("未找到 web/ 目录，跳过 web 仪表盘构建。")
        return
    npm = shutil.which("npm")
    if npm is None:
        warn("未检测到 npm，跳过 web 构建；可手动 ./scripts/build-web.sh。")
        return
    if dry_run:
        print("[dry-run] 将执行 web 构建 (npm run build)。")
        return
    if not os.path.isdir(os.path.join(WEB_DIR, "node_modules")):
        print("=> 首次构建，安装 web 依赖 (npm install) ...")
        try:
            subprocess.run([npm, "install"], cwd=WEB_DIR, check=True)
        except subprocess.CalledProcessError as e:
            warn(f"npm install 失败（退出码 {e.returncode}），跳过 web 构建。")
            return
    print("=> 构建 web 仪表盘 (npm run build) ...")
    try:
        subprocess.run([npm, "run", "build"], cwd=WEB_DIR, check=True)
        print("OK: web/dist/index.html 已随最新数据刷新。")
    except subprocess.CalledProcessError as e:
        warn(f"web 构建失败（退出码 {e.returncode}），跳过；可手动 ./scripts/build-web.sh 排查。")


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
    parser = argparse.ArgumentParser(description="规范化 data/poop.json 并刷新 web 仪表盘。")
    parser.add_argument("--dry-run", action="store_true", help="仅校验/预览，不写文件、不跑 web 构建。")
    parser.add_argument("--no-web", action="store_true", help="跳过 web 仪表盘构建。")
    args = parser.parse_args()

    records = load()
    changed = write_poop(records, dry_run=args.dry_run)

    if args.dry_run:
        print(f"[dry-run] {'将' if changed else '不'}规范化 data/poop.json（{len(records)} 条记录）。")
    else:
        print(f"OK: data/poop.json {'已' if changed else '无需'}改动（{len(records)} 条记录）。")

    build_web(dry_run=args.dry_run, skip=args.no_web)
    deploy(dry_run=args.dry_run)

    if _warn_count:
        print(f"（共 {_warn_count} 条告警，详见上方 WARN。）")


if __name__ == "__main__":
    main()
