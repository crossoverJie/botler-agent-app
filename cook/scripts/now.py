#!/usr/bin/env python3
"""Print current local time as ISO 8601 with +08:00 offset.

botler-agent has no clock of its own; this is the in-project way for it to
get the current time when timestamping a meal/waters `time` field (run via the
`run` tool). The cook convention extracts the HH:MM part for `meals.<餐>.time`.
"""
from datetime import datetime, timedelta, timezone

CST = timezone(timedelta(hours=8))
now = datetime.now(CST)
print(now.strftime("%Y-%m-%dT%H:%M:%S") + "+08:00")
