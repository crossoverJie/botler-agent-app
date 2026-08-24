# AGENTS.md

> 路由提示（botler-agent）：涉及「饮食 / 吃饭 / 记录三餐 / 喝水 / 饮水 / 喝水量 / 摄入」的记录或查询消息都属于本项目。每日饮水 ml 记录在当天日记录的 `water` 字段；饮食记录在 `data/days/YYYY-MM-DD.json` 的 `meals` 中。

> **这是开源模板（botler-agent-app）**：本目录只提供数据格式与约定示例，不含真实数据。示例文件以 `.sample.json` 结尾，仅供参照格式；`scripts/`（如 `build.py`）由使用者自行提供，本模板不包含脚本源码。

This file provides guidance to AI coding assistants (CodeBuddy Code, Claude Code, etc.) when working with code in this repository.

## What this project is

A personal nutrition / meal-plan tracking system. Structured food data is turned into a dashboard (e.g. a self-contained `nutrition.html`) and/or weekly Markdown reports. Keep it dependency-light (Python 3 stdlib is enough for the pipeline).

Replace the personal params below with your own:
- `weightKg` — your body weight.
- `tdee` — your total daily energy expenditure (kcal).
- `targets` — warning thresholds (per-kg protein, fat min, fiber min, calorie-deficit %).

## Commands (conventions — scripts are user-provided)

```bash
# Validate data and regenerate ALL outputs
python3 scripts/build.py

# Validate only, write nothing (safe to run after every data edit)
python3 scripts/build.py --dry-run
```

`build.py` is expected to: validate `data/days/*.json` (top-level totals must equal the sum of per-meal `foods` within a small tolerance), merge days into `data/intake.json`, and refresh the dashboard. Treat generated files as read-only.

## Architecture (data layout)

```
data/
  days/          Source of truth: ONE file per day (2026-08-03.json), 一天一条记录.
  intake.json    Generated aggregate of days/ (build.py writes it — do not hand-edit).
  foods.json     Ingredient nutrition library (per-100g style reference values).
  config.json    tdee, weightKg, targets (warning thresholds), rice block.
weekly/          Optional: one meal-plan report per week.
nutrition.html   Optional: self-contained dashboard template (data injected here).
```

## Key data shapes

- **Day record** (`data/days/YYYY-MM-DD.json`): `date` (YYYY-MM-DD string, must equal the filename), `calories/protein/fat/carb/fiber` (top-level totals), `water` (optional, daily water total in ml), `waters` (optional, per-drink detail `[{type, amount, time?}]`), `note` (string), and `meals` (object: meal-name → `{desc, foods:[...], time?}`). Each food: `name, amount, calories, protein, fat, carb, fiber`.
- **food db** (`foods.json` `foods`): `name → {per, kcal, protein, fat, carb, fiber}` where `per` is the gram basis.
- **config** (`config.json`): `tdee`, `weightKg`, `targets`, and an optional `rice` block (`factor`, `ratio`, `days`, `lunchCooked`, `dinnerCooked`).

See `data/days/2026-01-01.sample.json`, `foods.sample.json`, `config.sample.json` for concrete examples.

## Critical conventions (read before editing)

- **`data/days/` is the single source of truth** (one file per day; filename = date). `intake.json` is only the generated aggregate.
- **Top-level daily totals must equal the sum of their `meals` foods** (within tolerance) or the build hard-fails.
- **`amount` is grams.** Record amounts in grams (`"258g"`).
- **Recording mode (ad-hoc)**: when the user describes what they ate, estimate structured records from the `foods.json` reference library, then rerun the build. Do not invent nutrition numbers from memory — look them up in `foods.json`.
- **One date = one day record.** New intake merges into the existing day file; never create a second file for the same day.
- **History is immutable.** Changing a plan = create a new weekly file; do not rewrite old day files or weekly reports.
- **Encoding is UTF-8**; files are Chinese-language.

## Extending

Add new food references to `foods.json` (with a correct `per` basis) before using them in a day record. Add new planned combos under a `meals` block in `foods.json` if you want named combos.
