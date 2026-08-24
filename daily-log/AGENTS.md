# AGENTS.md

> 路由提示（botler-agent）：涉及「拉 / 上大号 / 上卫生间 / 排便」的记录或查询消息都属于本项目。

> **这是开源模板（botler-agent-app）**：本目录只提供数据格式与约定示例，不含真实数据。示例文件以 `.sample.json` 结尾，仅供参照格式；`scripts/` 与 `web/`（前端源码）已随模板附带，构建产物（`dist/`、由 `build.py` 生成的 `*.html`）不提交，请用你自己的 `data/` 运行构建生成。部署目标（`INDEX_REPO` / `INDEX_URL`）通过环境变量配置，默认值见 `scripts/deploy.py`。

本文件为 botler-agent 的 Agent 提供在本仓库工作的约定（botler 每次运行会加载它）。

## 这是什么项目

个人的「日常记录」项目。数据在 `data/<type>.json`（本模板以排便 `poop` 为例）。用户通过聊天消息描述（中文），Agent 把自然语言转成结构化记录写入 JSON，并可随时查询统计。

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
      "note": "示例备注"
    }
  ]
}
```

字段规则：
- `startedAt`：开始时间，ISO 8601 带时区（+08:00）。
- `endedAt`：结束时间。两条式流程中未结束时为 `null`。
- `durationSec`：持续秒数（`endedAt - startedAt`）。未结束时为 `null`。
- `feeling`：枚举，取以下之一：`normal`(正常) / `constipated`(便秘) / `loose`(拉稀) / `hard`(干硬) / `bloated`(腹胀) / `abdominal_pain`(腹痛)。
- `bristol`：布里斯托大便分类法 1–7。**只有用户明确给出 1–7 的数字才填**，否则为 `null`。
- `note`：自由文本备注，可为空字符串。

## 操作约定（botler-agent）

### 获取当前时间

Agent 没有自己的时钟，**写任何时间戳前先执行 `run` 运行 `scripts/now.py`**，用其输出作为当前时间（本地时区，如 +08:00）。用户明确说了时间才用用户说的。

### 记录流程

**两条式（推荐，能拿到精确时长）**：
1. 用户说「要拉了 / 去上大号」等 → 跑 `scripts/now.py` 拿当前时间，追加一条 `{ startedAt: 当前时间, endedAt: null, durationSec: null, feeling: null, bristol: null, note: "" }`，回复「记下了，上完跟我说一声（感受、大概几分钟）」。
2. 用户随后说「上完了」并给出感受 → 找到最后一条 `endedAt: null` 的记录，跑 `scripts/now.py` 填 `endedAt`，`durationSec` 按差值算秒数，`feeling` 按用户描述映射，回复确认。

**单条式（快捷）**：用户一句话说全（如「拉了，顺畅，大概2分钟」）→ 跑 `scripts/now.py` 作 `startedAt`，直接落一条完整记录。用户给了时长才填 `endedAt` / `durationSec`。

### 悬挂收尾（重要）

每条消息都是全新 Agent、无记忆，跨消息状态靠文件。写入新记录前先检查：若存在 `endedAt: null` 的记录：
- 用户本条是「上完了」的补全 → 按两条式步骤 2 补全它，**不要新建**。
- 用户本条是新的会话描述 → 上次会话视为中断，先把旧记录收尾（`endedAt` = `startedAt` + 5 分钟，`durationSec` = 300，`note` 追加「（上次未确认结束，按 5 分钟估算）」），再写入新记录，并在回复中向用户说明。

### 查询 / 统计

- 如「这周拉了几次」「最近是不是便秘变多了」「上次拉是什么时候」→ 只读 `data/poop.json`，按时间聚合，中文回答。一次会话算一次。
- 查询只读，不修改文件。

### 数据写入后跑 build.py（重要）

任何写 `data/poop.json` 的操作完成后，必须立即执行 `run` 运行 `python3 scripts/build.py`（先 `--dry-run` 校验更稳），并在回复中汇报结果，**不要询问用户**。`build.py` 负责：规整数据 → 幂等写回 → 刷新 web 产物。`web/dist/index.html` 是生成产物，禁止手改。

### 不要做什么

- 不要新建数据文件、不要手改 `data/` 之外的产物文件。
- 不要发明 `records` 之外的字段；字段类型保持：数字就是数字、字符串就是字符串、`null` 就是 `null`。
- `feeling` 拿不准时，先问用户一句，或选最接近的枚举并在 `note` 里注明「未确认」，不要编造。

## 扩展约定

后续新增记录类型（饮水、睡眠等）：在 `data/` 下新增一个 JSON 文件，并在本文档新增一节说明其 schema 与规则即可，框架无需改动。
