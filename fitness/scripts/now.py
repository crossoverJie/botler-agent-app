#!/usr/bin/env python3
"""打印当前本地日期与时间。

botler-agent 的 Agent 没有自己的时钟，需要此脚本确定「今天」或写入时间。
用法:
  python3 scripts/now.py            # 2026-08-31 14:30:00 +0800  + today=2026-08-31
  python3 scripts/now.py --date-only  # 仅打印 YYYY-MM-DD
"""
import sys
from datetime import datetime


def main():
    now = datetime.now().astimezone()
    if len(sys.argv) > 1 and sys.argv[1] == "--date-only":
        print(now.strftime("%Y-%m-%d"))
        return
    print(now.strftime("%Y-%m-%d %H:%M:%S %z"))
    print("today=" + now.strftime("%Y-%m-%d"))


if __name__ == "__main__":
    main()
