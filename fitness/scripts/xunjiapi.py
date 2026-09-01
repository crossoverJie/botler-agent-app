#!/usr/bin/env python3
"""训记 (Xunji) Open API 共享模块 —— 鉴权、gzip POST、限频重试。

- 仅使用 Python 标准库（urllib），botler-agent 的 run 工具可直接调用。
- 各领域脚本 (body.py / train.py / diet.py / templates.py) import 本模块。
- Key 默认取自 skills/*.md 中的常量，可通过环境变量覆盖（如 XUNJI_BODY_KEY）。
- 本模版仓库不含真实 Key：请在训记 App 内申请后，通过环境变量注入
  （XUNJI_TRAIN_KEY / XUNJI_BODY_KEY / XUNJI_DIET_KEY / XUNJI_SEARCH_KEY / XUNJI_TPL_KEY）。
"""
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

# ---- 鉴权（与 skills/*.md 保持一致；环境变量可覆盖）----
# 注意：默认值为空占位符，请通过环境变量注入真实 Key（见文件头说明）。
KEYS = {
    "train":  os.environ.get("XUNJI_TRAIN_KEY",  ""),
    "body":   os.environ.get("XUNJI_BODY_KEY",   ""),
    "diet":   os.environ.get("XUNJI_DIET_KEY",   ""),
    "search": os.environ.get("XUNJI_SEARCH_KEY", ""),
    "tpl":    os.environ.get("XUNJI_TPL_KEY",    ""),
}

# ---- 接口地址 ----
URLS = {
    "body_query": "https://api.xunjiapp.cn/open/body/query_gzip",
    "body_upsert": "https://api.xunjiapp.cn/open/body/upsert_gzip",
    "train_query": "https://trains.xunjiapp.cn/api_trains_for_llm_v2",
    "train_upsert": "https://trains.xunjiapp.cn/api_upsert_trains_for_llm_v2",
    "plan_query": "https://api.xunjiapp.cn/open/plan/query_gzip",
    "diet_query": "https://eatings.xunjiapp.cn/open/food/query_gzip",
    "diet_upsert": "https://eatings.xunjiapp.cn/open/food/upsert_gzip",
    "diet_custom": "https://eatings.xunjiapp.cn/open/food/custom/upsert_gzip",
    "diet_tpl_list": "https://eatings.xunjiapp.cn/open/food/templates/list_gzip",
    "diet_tpl_apply": "https://eatings.xunjiapp.cn/open/food/templates/apply_gzip",
    "food_search": "https://api.xunjiapp.cn/open_agent/food/search_gzip",
    "tpl_sync": "https://trains.xunjiapp.cn/api_agent_templates_sync_for_llm_v1",
    "tpl_mutate": "https://trains.xunjiapp.cn/api_agent_templates_mutate_for_llm_v1",
}


def new_client_id(prefix="agent"):
    """生成唯一 client_request_id / mutation_id / client_id。"""
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def _decompress(raw, headers):
    enc = (headers.get("Content-Encoding") or "").lower() if headers else ""
    if enc == "gzip" or raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    return raw


def post_json(url, payload, key, max_retries=6, timeout=50):
    """POST JSON 到训记接口；自动解 gzip 响应；'too frequent' 按 retry_after_ms 等待重试。"""
    for attempt in range(1, max_retries + 1):
        req = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Accept-Encoding": "gzip",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = _decompress(resp.read(), resp.headers)
        except urllib.error.HTTPError as e:
            raw = _decompress(e.read(), e.headers)
        except Exception as e:  # 网络层临时错误
            if attempt < max_retries:
                time.sleep(2)
                continue
            raise SystemExit(f"[xunjiapi] 请求异常: {e}")
        try:
            data = json.loads(raw.decode("utf-8"))
        except Exception:
            raise SystemExit(f"[xunjiapi] 响应不是合法 JSON: {raw[:200]!r}")
        # 限频：同一 key 同一 endpoint 15 秒一次（训练 full 30s / 写回 45s 由 skill 说明）
        if isinstance(data, dict) and str(data.get("res")) == "too frequent":
            wait = float(data.get("retry_after_ms") or 10000) / 1000 + 0.5
            if attempt < max_retries:
                sys.stderr.write(f"[xunjiapi] too frequent，等待 {wait:.0f}s 后重试（第 {attempt} 次）\n")
                time.sleep(wait)
                continue
        return data
    raise SystemExit("[xunjiapi] too frequent 重试次数耗尽")


def require_ok(data):
    """校验常见业务失败，返回 (ok, message)。"""
    if not isinstance(data, dict):
        return True, None
    res = data.get("res")
    if res == "apikey missing" or res == "apikey invalid":
        return False, "API Key 失效：请回训记 App 重新申请 Key，再复制并重新发送最新 Skill。"
    if res == "user confirmation required":
        return False, "服务端要求用户确认：请先展示写入摘要并等待用户确认，再带 confirmed:true 重试。"
    if res == "仅VIP可用":
        return False, "当前训记账号需要会员权限（仅VIP可用）。"
    return True, None


def print_json(obj, raw=False):
    print(json.dumps(obj, ensure_ascii=False, indent=2) if raw else json.dumps(obj, ensure_ascii=False))
