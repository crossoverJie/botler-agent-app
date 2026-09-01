#!/usr/bin/env python3
"""本地历史查询缓存。

仅缓存严格历史日期（date < 今天）的训练、身体、饮食数据。
写入操作不做缓存失效；需要强制更新时由各查询脚本传 --refresh。
"""
import json
import os
import time
from datetime import date, datetime, timedelta


CACHE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "cache"))


def _today():
    return datetime.now().astimezone().date()


def date_is_history(datestr):
    """判断日期字符串是否属于严格历史日期。"""
    try:
        return date.fromisoformat(datestr) < _today()
    except (TypeError, ValueError):
        return False


def iter_dates(start, end):
    """按天迭代闭区间 [start, end]。"""
    d = date.fromisoformat(start)
    e = date.fromisoformat(end)
    if d > e:
        return []
    dates = []
    while d <= e:
        dates.append(d.isoformat())
        d += timedelta(days=1)
    return dates


def read_cache(domain, name, ttl=None):
    """读取缓存文件，返回 envelope 或 None。

    envelope: {"payload": ..., "fetched_at": ..., "fetched_at_iso": ...}
    """
    path = os.path.join(CACHE_ROOT, domain, name)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            envelope = json.load(f)
    except (OSError, ValueError):
        return None
    if ttl is not None:
        fetched_at = float(envelope.get("fetched_at", 0) or 0)
        if time.time() - fetched_at > ttl:
            return None
    return envelope


def write_cache(domain, name, payload):
    """写入缓存文件；先写临时文件再替换，避免半写入。"""
    path = os.path.join(CACHE_ROOT, domain, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    envelope = {
        "fetched_at": time.time(),
        "fetched_at_iso": datetime.now().astimezone().isoformat(timespec="seconds"),
        "payload": payload,
    }
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(envelope, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)


def cache_label(envelope):
    """返回适合展示的本地缓存时间。"""
    if not envelope:
        return ""
    iso = envelope.get("fetched_at_iso") or ""
    try:
        return datetime.fromisoformat(iso).strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return ""
