# AGENTS.md

> 路由提示（botler-agent）：涉及「饮食 / 吃饭 / 记录三餐 / 喝水 / 饮水 / 喝水量 / 摄入」的记录或查询消息都属于本项目。每日饮水 ml 记录在当天日记录的 `water` 字段；饮食记录在 `data/days/YYYY-MM-DD.json` 的 `meals` 中。

This file provides guidance to AI coding assistants (CodeBuddy Code, Claude Code, etc.) when working with code in this repository.

## What this project is

A personal nutrition/meal-plan tracking system for a 69kg male cutting from ~16% to ~12% body fat (TDEE≈2400 kcal). The pipeline turns structured food data into auto-generated daily-intake tables inside weekly Markdown reports and a web calendar dashboard. No external dependencies — Python 3 stdlib only.

## Commands

```bash
# Validate data and regenerate ALL outputs (weekly tables + web dashboard)
python3 scripts/build.py

# Validate only, write nothing (safe to run after every data edit)
python3 scripts/build.py --dry-run

# Deploy web/dist/index.html to the public index showcase repo (copy + git push + print the public URL)
python3 scripts/deploy.py

# Rice raw/cooked weight + 70/20/10 split report (reads config.json rice block)
python3 scripts/rice.py                 # human-readable report
python3 scripts/rice.py --markdown      # also prints a paste-ready weekly table row
python3 scripts/rice.py --lunch 250 --dinner 200   # CLI override to check an old plan

# Run tests
python3 -m unittest tests/test_build.py tests/test_rice.py        # all tests
python3 -m unittest discover -s tests                            # same, auto-discover
python3 -m unittest tests.test_rice.TestComputeRice.test_old_plan_breakdown   # single test
```

## Web 日历仪表盘 (`web/`)

纯前端（Vite + TypeScript + ECharts），把 `data/*.json` 只读消费、构建时打包进单文件，**数据层 `data/*.json` 原样不动、`build.py` 一字不改**。提供日 / 周 / 月 / 年四视图 + ECharts 趋势图（含 dataZoom）。

### 命令

```bash
cd web
npm install          # 首次安装依赖（playwright-core 仅用于导出，不强制下载浏览器）
npm run dev          # 开发热更新，访问 http://localhost:5173/
npm run build        # 产出单文件 web/dist/index.html（可双击打开）
npm run typecheck    # 仅类型检查
npm run export -- --view month --date 2026-08-17   # 把指定视图导出为 PNG
```

### 图片自动导出（`npm run export`）

脚本 `web/scripts/export.mjs` 用无头浏览器打开 `dist/index.html?view=…&date=…&export=1`（`file://` 直读），等渲染完成后对主内容区（`.capture`：汇总卡 + 视图 + 趋势图）截图，保存为 2x PNG。

```bash
npm run export -- --view month --date 2026-08-17            # 月视图
npm run export -- --view week  --date 2026-08-17            # 周视图
npm run export -- --view day   --date 2026-08-17            # 日视图
npm run export -- --view year  --date 2026                  # 年视图（date 可为年份）
npm run export -- --view month --date 2026-08-17 --scale 3 --out ~/Desktop/a.png
```

- 输出默认落盘 `exports/`，命名如 `2026-08-17_月视图.png`（年视图为 `2026_年视图.png`）。
- **浏览器引擎自动回退**：① 系统 Chrome（`channel: 'chrome'`，本机零下载）→ ② Playwright 自带 Chromium（`npx playwright install chromium`）→ ③ 均不可用时报错提示安装。
- 依赖 `playwright-core`（轻量，install 时不下载浏览器）。
- 运行前必须先 `npm run build` 生成 `web/dist/index.html`，导出读的是这个单文件产物，不是 dev server。
- `?export=1` 会关闭页面过渡/动画，保证截图结果稳定可复现。

## 部署到 index 展示站（`scripts/deploy.py`）

`build.py` 在 web 构建结束后会自动调用 `scripts/deploy.py`（非阻断，失败仅告警），把 `web/dist/index.html` 复制到公开的 index 展示仓库并 git push，最后打印一行：

```
DEPLOY_OK https://crossoverjie.top/index/cook/?v=20260820-1610
```

- index 仓库本地路径：`~/Documents/dev/github/index`（DATA_ROOT 之外，public，GitHub Pages）。
- 结构：`index/index.html`（首页导航，手写）、`index/cook/index.html`（本脚本复制）、`index/daily-log/index.html`（daily-log 复制）。
- 默认域名 `https://crossoverjie.top/index`；可通过环境变量 `INDEX_REPO` / `INDEX_URL` 覆盖路径与域名。
- **回复约定**：run 输出里出现 `DEPLOY_OK <链接>` 时，回复末尾必须原样附上该链接，方便用户直接打开最新页面；不要自己拼链接。

## Architecture

```
data/
  days/          Source of truth: ONE file per day (2026-08-03.json), 一天一条记录.
  intake.json    Generated aggregate of days/ (build.py writes it — do not hand-edit).
  foods.json     Ingredient nutrition library (per-100g style reference values).
  config.json    tdee, weightKg, targets (warning thresholds), rice block.
scripts/
  build.py       Central pipeline: validate -> regenerate weekly tables.
  rice.py        Sole source of truth for rice raw/cooked weight math.
tests/           unittest suites mirroring the two scripts.
weekly/
  weekly-YYYYMMDD.md   One meal plan per week (YYYYMMDD = Monday start).
  README.md            Index of weekly reports.
background.md          Authoritative reference: nutrition params, meal-prep, rice formula.
hamburger.md           Example meal-substitution write-up (referenced from weekly reports).
web/                  Vite + TS + ECharts 日历仪表盘。
  src/                TS 源码（views / components / charts / utils / state）。
  scripts/export.mjs  图片自动导出脚本（Playwright，本机 Chrome 优先）。
  dist/index.html     单文件产物（npm run build 生成，打包内联数据，可双击 file:// 打开）。
  exports/            图片导出落盘目录（默认，已在 .gitignore 忽略）。
```

### Data flow (`scripts/build.py`)

1. `merge_days()` reads `data/days/*.json` (one file per day, filename = date), sorts by filename, and merges into a list — hard-fails on empty dir, non-object file contents, or filename/date mismatch. `write_intake()` writes the merged list back to `data/intake.json` (idempotent: skips write when semantically identical). `load()` reads `foods.json` and `config.json` and validates structure.
2. `validate_meals()` — **hard failure** (`sys.exit(1)`) if a day's top-level `calories/protein/fat/carb/fiber` do not equal the sum of its per-meal `foods` within `TOLERANCE = 0.5`. Cross-checking each food's macros against `foods.json` is **warn-only**. `validate_water()` — **hard failure** if `waters` 存在但各条 `amount` 之和不等于顶层 `water`；有 `water` 但无 `waters` 明细则仅告警（旧格式）。
3. `validate_targets()` — warn-only checks (per-kg protein, fat min, fiber min, calorie-deficit %) driven by `config.json` `targets`.
4. `update_weekly()` — for each `weekly-YYYYMMDD.md`, selects `days/` records falling in that Mon–Sun window and regenerates the table between `<!--AUTO_DAILY_START-->` / `<!--AUTO_DAILY_END-->`. Missing markers → abort.
5. `build_web()` — best-effort rebuilds the web calendar dashboard (`cd web && npm run build`), skipped if `web/` or npm is absent.

### Key data shapes

- **Day record** (`data/days/YYYY-MM-DD.json`): `date` (YYYY-MM-DD string, must equal the filename), `calories/protein/fat/carb/fiber` (top-level totals), `water` (可选，每日饮水总量 ml，= `waters` 各条 `amount` 之和), `waters` (可选，饮水分次明细 `[{type, amount, time?}]`), `note` (string), and `meals` (object: meal-name → `{desc, foods:[...], time?}`；`time` 为可选时段/说明，取值规则见下). Each food: `name, amount, calories, protein, fat, carb, fiber`.
- **food db** (`foods.json` `foods`): `name → {per, kcal, protein, fat, carb, fiber}` where `per` is the gram basis. `foods.json` also has a `meals` block (named planned combos) not consumed by `build.py`.
- **config** `rice` block: `factor` (default 2.3), `ratio` (default [0.7,0.2,0.1]), `days`, `lunchCooked`, `dinnerCooked`. `targets` 含 `waterMin`/`waterMax`（饮水 ml 目标，web 日视图/汇总卡/趋势图消费；饮水总量一致性由 `validate_water` 校验，`validate_targets` 不检查 water）。

### `scripts/rice.py` (authoritative rice math)

Never hand-compute rice weights. Formula: `raw = cooked / factor` (i.e. cooked ÷ 2.3 = raw), then split the total raw by `ratio` using the **largest-remainder method** (`distribute()`) so the integer parts sum exactly to `round(total_raw)`. CLI flags (`--lunch/--dinner/--days/--factor/--ratio`) override the config for checking alternative plans.

## Critical conventions (read before editing)

- **Do not hand-edit generated output.** Every `<!--AUTO_DAILY_START/END-->` table in `weekly/*.md` and `data/intake.json` (aggregate of `days/`) are produced by `build.py`. To change what they show, edit `data/days/*.json` and rerun the build. Likewise, `web/dist/index.html` is generated by `npm run build` in `web/` — never edit it by hand; change `web/src/*` and rebuild.
- **`data/days/` is the single source of truth** (one file per day; filename = date). `intake.json` is only the generated aggregate. Weekly reports only display a 7-day slice. When a plan changes, add new day files (and a new weekly file) — do not rewrite history in old records or old weekly reports.
- **读数据只读 `data/days/*.json`，绝不读 `data/intake.json`。** 聚合文件把全部历史内联成一个大数组，直接读会浪费大量 token；查某天就 open 对应日期文件，查汇总就用 grep 扫 `days/`。`intake.json` 只由 `build.py` 生成、由 web 构建时（`npm run build`）内联消费，Agent 不需要读它。
- **改 `days/` 后必跑 `build.py`，不得询问用户**：`intake.json` / weekly 表格 / web 产物都由它刷新（`write_intake` 幂等，语义一致会跳过写，但聚合可能过期，靠约定强制）。任何对 `data/` 下数据文件的写操作完成后，必须立即用 `run` 工具执行 `scripts/build.py`（先 `--dry-run` 校验通过后直接跑正式构建），并在回复中汇报刷新/校验结果；**不要询问用户是否执行**，也不要只做 dry-run 就结束。build.py 末尾会自动部署到 index 展示站并打印 `DEPLOY_OK <链接>`（见「部署到 index 展示站」），回复末尾须原样附上该链接。

- **记录后附一句话轻提醒（由大模型生成，非固定模板）**：每次成功写入当天饮食/饮水、跑完 `build.py` 后，在汇报「本餐/本次热量 + 今日累计」之外，另用**一句话**对今日摄入做轻提醒。**做法**：读 `data/config.json` 的 `targets` 阈值，对照你刚算出的今日 `calories/protein/fat/carb/fiber/water` 顶层 totals，挑**最值得说的一件事**自然地提醒一句——热量接近/达到 `tdee`（默认即上限，无需额外字段）就说「后面差不多了，别再吃了」；碳水/脂肪/饮水超上限就说「今天 XX 有点超，控制点」；蛋白/纤维/碳水不足就说「XX 还差些，补点 XX」；全部达标就给一句简短鼓励。**约束**：一句话、口语、像朋友随口提醒、**每次措辞可以不同**、不罗列多条、不分行。只读今天 `days/YYYY-MM-DD.json` 与 `config.json`，不读 `intake.json`、不读历史，token 可控。
- **Plan changes = new weekly file.** Create a new `weekly-YYYYMMDD.md` for a revised plan rather than rewriting an old one; the old report and its intake records are history.
- **Keep top-level daily totals consistent** with their `meals` sums or `build.py` will hard-fail (tolerance 0.5).
- **`amount` parsing is grams-only.** `parse_amount()` reliably handles `"258g"`; non-gram units like `"6个"` / `"198g（6个）"` are only handled if the corresponding `foods.json` `per` already折算s to the edible portion. Don't rely on it for new non-gram foods without a correct `per`.
- **鸡蛋默认记蛋白。** 用户提到「鸡蛋」但未显式说「全蛋/带蛋黄」时，录入 `data/days/` 一律按 `鸡蛋清`（`foods.json` 中 33g/个、17kcal/个）处理；仅当显式说「全蛋」时才用 `鸡蛋(全蛋)`（50g/个、72kcal/个）。
- **饮水默认记「矿泉水」。** 用户提到喝水/饮水但未指明水类型时，`waters` 明细一律记 `type: "矿泉水"`；明确说了（白开水/气泡水/茶水等）才用对应类型。`water` 总量 = 各条 `amount` 之和，每次接满一壶 ≈ 830ml（用户常按一壶计）。**时段 `time`：用户说了时段（上午/下午/晚上/睡前等）就照记为对应时段文字；没说具体时段时，不标「第 N 壶」，而是先 `run` 执行 `scripts/now.py` 拿当前时间、取其 `HH:MM` 部分作为喝水时间（本地时区）。即：未指明时段 = 记录动作发生的当前时间，而非顺序号。不要尝试用 `date` 等 shell 命令取时间（run 工具只能跑 .py/.js/.mjs 脚本）。**
- **餐次 `time` 沿用饮水约定。** `meals.<餐>.time` 取值规则与 `waters[].time` 完全一致：用户说了时段（上午/晚上/睡前等）记对应文字；没说具体时段时记**记录该餐时的当前时刻** `HH:MM`（先 `run` 执行 `scripts/now.py` 取当前时间的 `HH:MM` 部分，不要跑 `date` 命令）。web 日视图会展示该时间并按时间升序对餐次排序；**无 `time` 的历史餐次排在后面、不影响构建**。`time` 为可选字段，`validate_meals` 只读 `foods` 宏量、忽略 `time`，加入不会触发任何校验失败。
- **Preserve the `AUTO_DAILY` comments** in weekly files — `build.py` aborts if they're missing.
- **Encoding is UTF-8 throughout**; files are Chinese-language.

### 记录方式（ad-hoc / 周末摄入）

- **口头描述 → 估算入库**：用户直接口述当天吃了什么时，由助手按 `data/foods.json` 营养参考库把食材估算汇总成 `data/days/YYYY-MM-DD.json` 记录（含 `meals` 明细）后跑 `build.py`。零散/外卖食物按近似食材估算，包装类以标签为准；**`foods.json` 是单一营养查表，勿凭记忆瞎填数值**。
- **可接受结构化输入**：用户若直接给结构化 JSON，可原样入库，无需再拆解估算。
- **历史不可变**：旧 `weekly-*.md` 与其 `data/days/*.json` 切片视为不可变历史。用户明确反对改写旧档（"为什么要修改……的数据，新的方案你帮我新建一份文档即可"）。方案变更只新建文档、只追加未来日期记录。
- **一个日期 = 一条 day record**：`data/days/` 里同一天只能有一个文件。新增摄入一律合并进当天已有记录（追加到对应 meal 的 `foods`），**绝不为同一天新建第二条记录**。
- **「零碎饮食」meal**：零散零食/饮品、用户未说明餐次的摄入，统一归入 `meals.零碎饮食`（`desc` 用 ` + ` 连接）；用户明确说了餐次（早餐/午餐/晚餐/加餐）才归对应餐次。
- **餐次 `time` 录入须知（记录时刻 ≠ 用餐时刻）**：`meals.<餐>.time` 记的是「录入动作发生的当前时刻」，不是「真实用餐时刻」。实时记录没问题；**补录 / 批量回填**一整天的旧数据时该时刻会失真，按它排序会误导，录入时须留意。旧 `data/days/*.json` 不回填 `time`，只给未来新录入的 meal 加。
- **周视图不排序、不显示 meal 时间（有意为之）**：web 周视图（`web/src/views/week.ts`）按录入顺序陈列、且不显示 meal 时间——这是**有意为之**，不是遗漏。日视图按 `time` 排序、周视图按录入顺序，两者在「带 time 的未来数据」上顺序可能不一致（历史无 time 数据时恰好一致）；不要把它当 bug 修。
- **顶层 totals 必须重算**：每次改动后，当天 `calories/protein/fat/carb/fiber` = 该日所有 meals 所有 foods 逐项求和（保留 1 位小数），不要在前值上累加。

### 份量估算参考（口述「吃了什么」时用）

| 口语描述 | 默认估算 |
|----------|----------|
| 「一根烤肠/香肠」 | 80g |
| 「一杯奶茶/咖啡」 | 中杯 500ml / 350ml |
| 「一瓶可乐/饮料」 | 500ml（罐装 330ml） |
| 「一块饼干」 | 15g |
| 「几块」「几个」 | ×2 |
| 「一份」「一碗」 | 视食物，通常 300–500g |
| 「半碗」 | 酌情折半 |
| 「尝了一口/一小口」 | ~20g/20ml |

> 优先以 `data/foods.json` 的 `per` 作为标准份量；上表用于把口语折算到 `per` 基准。

## Tests

Pure stdlib `unittest`, no fixtures beyond the test files themselves (they write temp JSON to verify `merge_days`/`write_intake`/`build.load`/`validate_*` and exercise `rice.compute_rice`/`markdown_row`). `test_rice` deliberately pins the 548+157+78 (old plan) and 426+122+61 (new plan) breakdowns so a regression in the rice formula fails loudly.
