# AGENTS.md

本文件为 botler-agent 的 Agent 提供在本仓库工作的约定（botler 每次运行会加载它）。

## 这是什么项目

个人的「日常记录」项目，记录**上大号（排便）**与**小便（排尿）**两类。排便数据在 `data/poop.json`，小便数据在 `data/pee.json`。
用户通过聊天消息描述（中文），Agent 把自然语言转成结构化记录写入对应 JSON，并可随时查询统计。

路由提示：
- 涉及「拉 / 上大号 / 上卫生间 / 排便」的消息归**本项目（poop）**。
- 涉及「尿 / 小便 / 撒尿 / 排尿」的消息归**本项目（pee）**。
- 单独说「上厕所 / 去卫生间」且**无上下文**时，默认归 **poop**（维持现状）；只有明确带「尿」字才归 pee。

## 数据文件

### data/poop.json

每条记录一次排便会话，结构：

```json
{
  "records": [
    {
      "startedAt": "2026-08-20T09:15:00+08:00",
      "endedAt": "2026-08-20T09:17:30+08:00",
      "durationSec": 150,
      "feeling": "normal",
      "bristol": 4,
      "note": "今天吃了火锅"
    }
  ]
}
```

字段规则：
- `startedAt`：开始时间，ISO 8601 带时区（+08:00）。
- `endedAt`：结束时间。两条式流程中未结束时为 `null`。
- `durationSec`：持续秒数（`endedAt - startedAt`）。未结束时为 `null`。
- `feeling`：枚举，取以下之一：
  - `normal` 正常
  - `constipated` 便秘
  - `loose` 拉稀
  - `hard` 干硬
  - `bloated` 腹胀
  - `abdominal_pain` 腹痛
- `bristol`：布里斯托大便分类法 1–7。**只有用户明确给出 1–7 的数字才填**，否则为 `null`。
- `note`：自由文本备注，可为空字符串。

### data/pee.json

每条记录一次排尿，结构：

```json
{
  "records": [
    {
      "startedAt": "2026-08-25T09:00:00+08:00",
      "feeling": "normal",
      "volume": "normal",
      "color": "light",
      "note": ""
    }
  ]
}
```

字段规则：
- `startedAt`：记录时间，即排尿那一刻，ISO 8601 带时区（+08:00）。因为通常都是尿完之后才记录，**不需要 `endedAt` / `durationSec`**（小便时间短，不记时长）。
- `feeling`：枚举，取以下之一：
  - `normal` 正常
  - `urgent` 尿急
  - `painful` 尿痛
  - `frequent` 尿频
  - `foamy` 泡沫尿
- `volume`：尿量主观分级枚举，取以下之一（肉眼无法精确量化毫升数，故只记档位）：
  - `little` 少
  - `normal` 一般
  - `much` 多
 
  **只有用户明确说出「多 / 少 / 一般（正常）」才填**，否则为 `null`；非这三个值由 build.py 置 `null` 并告警 `[pee]`。
- `color`：颜色枚举，取以下之一：
  - `pale` 无色
  - `light` 浅黄（正常）
  - `deep` 深黄
  - `cloudy` 浑浊
  - `blood` 血尿
- `note`：自由文本备注，可为空字符串。

> 注意「血尿」只落在 `color`（客观可观察），`feeling` 不含血尿，避免用户说「血尿」时填重或填错。

## 操作约定（botler-agent）

### 获取当前时间

Agent 没有自己的时钟，**写任何时间戳前先执行 `run` 运行 `scripts/now.py`**，用其输出作为当前时间（本地时区 +08:00）。用户明确说了时间（如「早上8点拉的」）才用用户说的。

### 记录流程

**两条式（推荐，能拿到精确时长）**：
1. 用户说「要拉了 / 去上大号」等 → 跑 `scripts/now.py` 拿当前时间，追加一条 `{ startedAt: 当前时间, endedAt: null, durationSec: null, feeling: null, bristol: null, note: "" }`，回复「记下了，上完跟我说一声（感受、大概几分钟）」。
2. 用户随后说「上完了」并给出感受 → 找到最后一条 `endedAt: null` 的记录，跑 `scripts/now.py` 填 `endedAt`，`durationSec` 按差值算秒数，`feeling` 按用户描述映射，回复确认。

**单条式（快捷）**：
- 用户一句话说全（如「拉了，顺畅，大概2分钟」）→ 跑 `scripts/now.py` 作 `startedAt`，直接落一条完整记录。用户给了时长才填 `endedAt` / `durationSec`。

### 小便（pee）记录流程

小便通常很快、且都是尿完之后才记录，因此**只用单条式**：用户一句话说全（如「尿了，正常，量挺多，浅黄」）→ 跑 `scripts/now.py` 作 `startedAt`，直接落一条完整记录（pee 没有 `endedAt` / `durationSec`；给了尿量档位才填 `volume`（少/一般/多），给了颜色才填 `color`，给了感受才填 `feeling`）。

### 悬挂收尾（重要）

每条消息都是全新 Agent、无记忆，跨消息状态靠文件。写入新记录前先检查：若存在 `endedAt: null` 的记录：

- **跨数据集隔离（关键）**：检查 `endedAt: null` 时**只看当前正在写入的数据集**。poop 与 pee 的挂起会话互不影响——一条「尿了 / 上完了（尿）」的消息**绝不**去收尾上一条 poop 的挂起记录，反之亦然。各自只补全 / 收尾自己数据集内的记录。
- 用户本条是「上完了」的补全 → 在**同一数据集**内找到最后一条 `endedAt: null` 的记录按两条式步骤 2 补全它，**不要新建**。
- 用户本条是新的会话描述 → 同一数据集内，上次会话视为中断，先把旧记录收尾（`endedAt` = `startedAt` + 5 分钟，`durationSec` = 300，`note` 追加「（上次未确认结束，按 5 分钟估算）」），再写入新记录，并在回复中向用户说明。

### 查询 / 统计

- 如「这周拉了几次」「最近是不是便秘变多了」「上次拉是什么时候」→ 只读 `data/poop.json`，按时间聚合，中文回答。一次会话算一次。
- 如「今天尿了几次」「最近尿量正常吗」「小便颜色有没有异常」→ 只读 `data/pee.json`，按时间聚合，中文回答。
- 查询只读，不修改文件。

### 数据写入后跑 build.py（重要）

`web/` 是只读可视化前端，`data/poop.json` 与 `data/pee.json` 在**构建时**内联进单文件产物 `web/dist/index.html`。`scripts/build.py` 是数据落盘后的统一收口：**读入 -> 规整成规范 schema（修 `records` 折叠、`"null"` 字符串、数字字符串、非法枚举等）-> 幂等写回 -> 刷新 web 产物**。它通过 `DATASETS` 注册表同时处理所有数据集（poop / pee），新增类型只需在注册表加一项。

因此任何写 `data/poop.json` **或** `data/pee.json` 的操作完成后，必须立即执行 `run` 运行 `python3 scripts/build.py`，并在回复中汇报结果（含 WARN 告警，WARN 带 `[poop]` / `[pee]` 前缀以便定位），**不要询问用户**。常用参数：`--dry-run`（只校验不写）、`--no-web`（跳过 web 构建）。build.py 末尾会自动调用 `scripts/deploy.py` 把最新 web 产物推送到公开的 index 展示仓库；若 run 输出中出现 `DEPLOY_OK <链接>`，回复末尾必须原样附上该链接（如「最新页面：<链接>」）。

- **记录后附一句话轻观察（由大模型生成，非固定模板）**：每次成功写入 `data/poop.json` 或 `data/pee.json`、跑完 `build.py` 后，在汇报确认之外，另用**一句话**对本次/今日做轻观察或提醒。**做法**：基于你刚写入的记录 + 今天该数据集的 `records`（`data/poop.json` / `data/pee.json`，本来就读写了），挑最值得说的一点自然地讲一句——尿色偏深→「今天尿有点黄，多喝水」；排便偏干/便秘→「有点干，多吃点纤维」；尿量频/急→「最近尿有点频，留意下」；都正常→一句轻松观察（如「今天都顺，继续保持」）。**约束**：一句话、口语、像朋友随口说、**每次措辞可以不同**、不罗列、不分行。只读今天的记录，不读历史、不跑全量统计，token 可控。

`web/dist/index.html` 是生成产物，禁止手改；要改界面就改 `web/src/*` 后重新构建（`./scripts/build-web.sh` 仅重刷 web，不碰数据）。

### 不要做什么

- 不要新建数据文件、不要手改 `data/` 之外的文件（`web/dist/index.html` 由构建脚本生成，不在此列）。
- 不要发明 `records` 之外的字段；字段类型保持：数字就是数字、字符串就是字符串、`null` 就是 `null`。
- `feeling` 拿不准时，先问用户一句，或选最接近的枚举并在 `note` 里注明「未确认」，不要编造。

## Web 仪表盘（web/）

纯前端（Vite + TypeScript + ECharts + html-to-image），只读消费 `data/poop.json` 与 `data/pee.json`，构建时内联成单文件 `web/dist/index.html`（可双击 file:// 打开，无需服务）。仪表盘顶部用「便便 / 小便」标签页切换两套独立的汇总、图表与明细。

### 命令

```bash
python3 scripts/build.py           # 规整数据 + 刷新 web（写数据后必跑）
python3 scripts/build.py --dry-run # 仅校验/预览，不写文件
python3 scripts/deploy.py          # 部署 web/dist 到公开 index 展示仓库
./scripts/build-web.sh             # 仅重刷 web（不碰数据，手动用）
cd web && npm run dev              # 开发热更新 http://localhost:5173/
cd web && npm run typecheck        # 仅类型检查
cd web && npm run export -- --view share --date 2026-08-20      # 导出分享卡片 PNG
cd web && npm run export -- --view dashboard --date 2026-08-20  # 导出完整仪表盘 PNG
```

### 截图按钮

页面顶栏「导出图片」弹窗预览移动端分享卡片（`.share-card`，375px），点「下载 PNG」用 html-to-image 导出 2x PNG，文件名 `poop-YYYY-MM-DD.png`。桌面端不做响应式。

### 图片导出（npm run export）

`web/scripts/export.mjs` 用无头浏览器（系统 Chrome → Playwright Chromium 回退）打开 `dist/index.html?view=…&date=…&dataset=…&export=1`，等渲染完成后截图，比浏览器按钮更稳定、可脚本化。

```bash
cd web && npm run export -- --view share --date 2026-08-20          # 排便分享卡片（默认 dataset=poop）
cd web && npm run export -- --view share --dataset pee --date 2026-08-20     # 小便分享卡片
cd web && npm run export -- --view dashboard --date 2026-08-20               # 排便完整仪表盘
cd web && npm run export -- --view dashboard --dataset pee --date 2026-08-20 # 小便完整仪表盘
cd web && npm run export -- --view share --scale 3 --out ~/Desktop/a.png
```

- `--view`：`share`（分享卡片，默认）/ `dashboard`（完整仪表盘）。daily-log 是单看板，没有 cook 那样的 day/week/month/year 视图。
- `--dataset`：`poop`（默认）/ `pee`，决定导出哪套数据；导出模式下页面只激活该数据集标签页并只渲染其图表（规避隐藏容器零尺寸）。
- `--date`：锚定日期（YYYY-MM-DD），把「现在」设为该日，用于导出历史快照；缺省为今天。
- `--scale`：像素倍率（默认 2）；`--out`：输出路径。
- 输出默认落盘 `exports/`，命名如 `poop-2026-08-20_分享卡片.png` / `pee-2026-08-20_仪表盘.png`（已 gitignore）。
- 运行前必须先 `python3 scripts/build.py` 生成 `web/dist/index.html`。

### 目录

```
web/
  index.html        入口
  vite.config.ts    @data 别名指向 ../data；vite-plugin-singlefile 单文件打包
  src/              TS 源码（types / data / utils / summary / charts / detail / share / main / style）
  dist/index.html   构建产物（gitignore，禁止手改）
```

## 部署到 index 展示站（`scripts/deploy.py`）

`build.py` 在 web 构建结束后会自动调用 `scripts/deploy.py`（非阻断，失败仅告警），把 `web/dist/index.html` 复制到公开的 index 展示仓库并 git push，最后打印一行：

```
DEPLOY_OK https://crossoverjie.top/index/daily-log/?v=20260820-1610
```

- index 仓库本地路径：`~/Documents/dev/github/index`（DATA_ROOT 之外，public，GitHub Pages）。
- 结构：`index/index.html`（首页导航，手写）、`index/cook/index.html`（cook 复制）、`index/daily-log/index.html`（本脚本复制）。
- 默认域名 `https://crossoverjie.top/index`；可通过环境变量 `INDEX_REPO` / `INDEX_URL` 覆盖路径与域名。
- **回复约定**：run 输出里出现 `DEPLOY_OK <链接>` 时，回复末尾必须原样附上该链接，方便用户直接打开最新页面；不要自己拼链接。

## 扩展约定

后续新增记录类型（饮水、睡眠等）：在 `data/` 下新增一个 JSON 文件（如 `data/water.json`），并在本文档新增一节说明其 schema 与规则，同时在 `scripts/build.py` 的 `DATASETS` 注册表加一项（含 `known_fields` / `feeling_enum` / `extra` 规整逻辑）、在 `web/` 前端加对应类型常量与一套 `summary/charts/detail/share` 配置即可。统计层已由 `web/src/data.ts` 的 `createDataset` 工厂通用化，新增类型主要补「数据集特有字段的聚合函数」与「前端配置」，无需复制通用统计逻辑。
