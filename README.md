# botler-agent-app

Open-source **data templates** for [botler-agent](https://github.com/crossoverjie/botler-agent) — a lightweight personal agent framework.

This repo contains the **format and conventions** of four data subprojects that botler-agent can operate on. It ships **sample/synthetic data only** — no real records, no real history. Use it as a starting point: clone it (or copy the folders you want) into your `DATA_ROOT`, and botler-agent will read each subproject's `AGENTS.md` to learn how to record and query.

## Subprojects

| Folder | What it tracks | Key data file |
|--------|----------------|---------------|
| `cook/` | Nutrition / meal-plan tracking (per-day intake, water, food library) | `data/days/YYYY-MM-DD.json` + `foods.json` + `config.json` |
| `daily-log/` | Daily-life logs (example: bowel-movement / poop tracking) | `data/poop.json` |
| `ledger/` | Personal accounting (per-day expense/income, categories, tags, payers) | `data/days/YYYY-MM-DD.json` + `data/meta.json` |
| `travel/` | Travel events (text + photos + places; money stays in `ledger`) | `data/days/YYYY-MM-DD.json` + `data/cities.json` |

Each folder has its own `AGENTS.md` describing the schema and the recording/query conventions botler-agent follows. Sample files are named `*.sample.json` so they are clearly not real data.

## How to use with botler-agent

1. Clone this repo (or copy the subproject folders you want) into your `DATA_ROOT`:
   ```bash
   export DATA_ROOT=/path/to/your/data-root
   git clone <this-repo> "$DATA_ROOT"
   ```
2. Point botler-agent at it via the `DATA_ROOT` env var (see botler-agent's `.env.example`).
3. Run botler-agent (`npm start`). It loads each subproject's `AGENTS.md` and operates on the data files.

> Note: when cloned as a single repo into `DATA_ROOT`, botler-agent's commit step treats the whole clone as **one** git repo (the subprojects don't have their own `.git`). For independent per-project commits, make each subproject its own repo instead.

## What is NOT included

- Real data / history (everything here is synthetic).
- `scripts/` (e.g. `build.py`, `now.py`) — the data pipeline is user-provided; the `AGENTS.md` files document the expected behavior.
- Dashboard front-ends (`web/`, `nutrition.html`) — generated outputs, not part of the template.

## Customizing

Edit a subproject's `AGENTS.md` to change its schema/rules, add fields, or adjust categories/accounts/payers in `ledger/data/meta.json` and cities in `travel/data/cities.json`. botler-agent picks up `AGENTS.md` changes on every run — no restart needed.
