# AGENTS.md

> **模版仓库说明**：`skills/*.md` 为空占位文件，`scripts/xunjiapi.py` 的 Key 默认值为空。使用前请先在训记 App 内申请各领域 Open API Key，将 App 返回的 Skill 文档粘贴进对应 `skills/*.md`，并通过环境变量（`XUNJI_TRAIN_KEY` / `XUNJI_BODY_KEY` / `XUNJI_DIET_KEY` / `XUNJI_SEARCH_KEY` / `XUNJI_TPL_KEY`）注入 Key。

> 路由提示（botler-agent）：涉及**训记 App** 的身体 / 训练 / 饮食数据消息归本项目。触发词：体重 / 体脂 / 体测 / 身体数据 / 围度 / 训练 / 练了 / 撸铁 / 卧推 / 深蹲 / 肩 / 背 / 腿 / 有氧 / 跑步记录 / 训练计划 / 官方计划 / 训练模板 / 训记里的饮食记录 / 训记。**优先规则**：用户明确提到「训记」App 内的记录或查询，一律归本项目。不冲突的边界：饮食热量本地统计归 cook 项目、金额记账归 ledger 项目、车辆保养归 car-maintenance 项目、梦境归 dream-journal、旅行归 travel、排便排尿归 daily-log。

## 这是什么项目

**训记（Xunji）健身 App 的 Open API 数据管理项目**，通过 4 个 Skill（`skills/train.md` 训练、`skills/diet.md` 饮食、`skills/health.md` 身体、`skills/personal-template.md` 个人模板）读写用户在训记 App 里的数据：

- **身体数据**：体重 / 体脂率 / 各围度（颈胸腰肩臀臂腿小腿）的查询与写入。
- **训练数据**：某天训练记录的读取与写回（重量 / 次数 / RPE / 打勾 / 有氧日 / 历史颜色），以及官方训练计划（PlatformPlan / UniversalPlan）的读取。
- **饮食数据**：训记内饮食记录的查询 / 写回、官方食物搜索、自定义食物、饮食模板。
- **个人模板**：Agent 专属文件夹内训练模板的增量同步与增删改。

**关键运行约束**：botler-agent 的 Agent 只有 read / write / edit / run 四个文件工具，**没有 curl / bash**；`run` 只能运行本项目 `scripts/` 下**已存在**的 `.py` 脚本（`execFileSync`，无 shell，工作目录锁定在项目根，60s 超时，输出读 stdout）。因此**所有 API 调用一律通过 `scripts/` 下的 Python 脚本完成**，不要尝试用 curl、不要凭空新建脚本再 run。

## 仓库结构

```
fitness/
├── AGENTS.md            # 本文件（代理工作指南，botler-agent 每次运行会加载）
├── skills/              # 训记 Open API 技能定义（原始来源，含 Key 与字段口径）
│   ├── train.md           # 训练数据 + 官方计划
│   ├── diet.md            # 饮食数据 + 食物搜索 + 自定义食物 + 模板
│   ├── health.md          # 身体数据
│   └── personal-template.md  # Agent 个人训练模板
├── data/
│   ├── cache/             # 查询缓存
│   └── sync/
│       └── cook-diet-sync.json  # cook → 训记饮食同步幂等标记（agent 维护）
└── scripts/             # Python 帮助脚本（仅标准库；botler-agent 用 run 调用）
    ├── xunjiapi.py        # 共享模块：鉴权 / gzip POST / too-frequent 重试（被各脚本 import）
    ├── now.py             # 打印当前本地日期时间（Agent 没有时钟）
    ├── body.py            # 身体数据 query / upsert
    ├── train.py           # 训练 query / upsert + 官方计划 plan list / get
    ├── diet.py            # 饮食 query / search / upsert / custom / tpl-list / tpl-apply
    └── templates.py       # 个人模板 sync / mutate
```

## 鉴权与安全

- Key 封装在 `scripts/xunjiapi.py` 的 `KEYS` 字典里（与 `skills/*.md` 一致），支持环境变量覆盖（`XUNJI_TRAIN_KEY` / `XUNJI_BODY_KEY` / `XUNJI_DIET_KEY` / `XUNJI_SEARCH_KEY` / `XUNJI_TPL_KEY`）。
- **不要把 Key 写进日志、聊天回复或展示给第三方**；脚本已在内部处理，回复里不要复述 Key。
- 所有脚本只输出到 stdout；限频与重试已由 `xunjiapi.py` 自动处理（等待 `retry_after_ms` 后重试最多 6 次）。

## 脚本用法

> 统一规则：查询脚本默认输出人类可读摘要；加 `--raw` 输出原始 JSON。写操作先 `--dry-run`/不带 `--confirm` 校验并展示摘要，用户确认后才 `--confirm`。

### 时间（`now.py`）

Agent 没有时钟，需要「今天」或当前时间时先 run `scripts/now.py`（或 `--date-only`）。

### 身体数据（`body.py`）

```bash
python3 scripts/body.py query --start 2026-01-01 --end 2026-08-31            # 全部指标
python3 scripts/body.py query --start 2026-08-01 --end 2026-08-31 --types weight,bodyfat
python3 scripts/body.py upsert '[{"datestr":"2026-08-31","type":"weight","value":69.0}]'   # 先校验
python3 scripts/body.py upsert '[{"datestr":"2026-08-31","type":"weight","value":69.0}]' --confirm  # 确认后写入
```

- `upsert` 按 `datestr + type` 覆盖更新；先 run（dry_run）把 `res.summary` 展示给用户，确认后再 `--confirm`。**只有用户确认后才 `--confirm`**。
- 类型口径：`weight`=kg、`bodyfat`=%、围度类（`neck/chest/weist/shoulder/bot/arm_*/forearm_*/leg_*/cav_*`）=cm；**腰围字段是 `weist`，不要写成 `waist`**。

### 训练数据（`train.py`）

```bash
python3 scripts/train.py query --date 2026-08-31                     # 轻量读取
python3 scripts/train.py query --date 2026-08-31 --full              # 完整（未打勾组/RPE/心率等）
python3 scripts/train.py plan list                                   # 官方计划列表
python3 scripts/train.py plan get --plan-ref platform:155 --start 2026-07-12 --end 2026-08-12
python3 scripts/train.py upsert '<训练数组或 {"trains":[...]}>'      # 先校验
python3 scripts/train.py upsert '<...>' --confirm                    # 确认后写回
```

- 写回只传动作**中文名**（服务端回填内部 key）；不确定中文名时从 `https://github.com/Foveluy/Xunji-movements` 选，**不要编造动作名**。
- 更新旧训练时保留 `localid`、`start`、`end`、`title`、`movements`、`note` 等元数据，只改目标字段；`note` 若是 JSON 字符串先解析成对象再合并。
- 组至少含 `weight/weight_kg`、`reps`、`time/duration_s`、`selfWeight` 之一；未完成组用 `done:false`，不要擅自删。
- 有氧日用 `cardio:true` 的 movement（不传 sets），`recordPreset` 可填 `general/running/walking/cycling/swimming/jumpRope/hiit`；不要用 `跑步_有氧训练` + sets（会变成力量动作）。
- RPE 写在组上（字符串 `"6"`~`"10"`，清空用 `""`）；难度 `easy/normal/hard` 写在动作上；改这些前先 `--full` 读原训练。
- 历史颜色改 `note.trainColor`（CSS 十六进制，如 `#FF7A00`），不是顶层 `color`。

### 官方计划（`train.py plan`）

- 只读；用训练数据 Key。先 `plan list` 拿到 `plan_ref`（`platform:155` / `universal:155`），再 `plan get`。
- `get` 不传日期默认今天前 7 天到后 30 天；自定义范围最多 92 天；只要日历时加 `--no-movements`。

### 饮食数据（`diet.py`）

```bash
python3 scripts/diet.py query --start 2026-08-01 --end 2026-08-31
python3 scripts/diet.py search --kw 鸡蛋 --limit 8
python3 scripts/diet.py upsert '<foods json>' --confirm
python3 scripts/diet.py custom '<food json>' --confirm
python3 scripts/diet.py tpl-list
python3 scripts/diet.py tpl-apply '<payload json>' --confirm
```

- 查询日期限制：**过去一年 ~ 未来 3 个月**；用户要求更大范围时先解释并拆分。
- 官方食物写回前先 `search` 拿 `uniquekey` + `ntr`；`foods` 元素形如 `{date, meal_type, name, amount, unit, uniquekey, ntr:{cal,protein,fat,carb}}`，`meal_type` ∈ `breakfast/lunch/dinner/snack`。
- 搜索不到或包装/餐厅/私有食物时，才创建自定义食物（`custom`），`ntr` 与 `units` 是每 100g 营养；创建前向用户展示营养来源与摘要并确认。
- 套用饮食模板也是写操作，必须先展示摘要并确认。

### cook → 训记饮食同步幂等标记

涉及「把 cook 项目今天的饮食数据同步到训记」时：

1. 同步前先 read `data/sync/cook-diet-sync.json`。
2. 若文件中 `lastSyncedDate` 等于今天且 `status === "ok"`，则**直接跳过**，不要再次 run `diet.py upsert ... --confirm`，也不要覆盖任何饮食记录。
3. 只有成功写入训记饮食、且脚本返回成功后才 write 更新该文件为：

```json
{
  "lastSyncedDate": "<今天的 YYYY-MM-DD>",
  "status": "ok",
  "syncedAt": "<完成时的 ISO 8601 本地时间>"
}
```

若写入失败、未确认或结果不确定，保持原标记不变；下一次同步仍按上面的步骤重新判断。

### 个人模板（`templates.py`）

```bash
python3 scripts/templates.py sync [--cursor N] [--include-content]   # 增量同步
python3 scripts/templates.py mutate '<payload json>'                  # 先展示摘要
python3 scripts/templates.py mutate '<payload json>' --confirm        # 确认后应用
```

- **硬性限制**：只有 1 个专属文件夹（服务端 ID 固定，显示名可改），最多 **14** 个有效模板，每模板 ≤15 动作、每动作 ≤20 组；写入前必须检查全部四项，超限先询问用户删减或替换，**不得静默截断、不得另建文件夹**。
- `sync` 首次 `cursor:0`，把返回的 `next_cursor` 按用户持久保存；同一任务内不要重复全量请求，除非缓存丢失或返回 `cursor invalid`。
- `mutate` payload：`{folder_update?:{name,base_version}, upserts:[...], deletes:[...]}`；`upserts[].client_id` 用于幂等，更新/删除用同步所得的 `template_id` + `base_version`。
- 文件夹名 / 模板名只能含中文、英文字母、数字、普通空格（≤32 字符）；禁止 emoji、标点、符号、换行、不可见字符。
- 递增规则按训记口径「双重递增」：先加次数，所有工作组达标后再加重量并重置次数；不编造百分比。

## 写操作确认流程（强制）

任何写操作（身体 upsert、训练写回、饮食写回/自定义/模板、个人模板 mutate）必须：

1. 先展示**变更摘要**：涉及的数据（日期 / 指标类型 / 数值 / 单位 / 动作 / 组数 / 食物 / 份量）与新增/修改/覆盖的范围。
2. 等待用户**明确确认**。
3. 确认后才 run 脚本并加 `--confirm`（身体写入还要带 `confirmed:true`，由脚本处理）。
4. 服务端返回 `user confirmation required` 时，回到第 1 步展示摘要等确认。

不要根据推测或未确认建议直接写入；用户未确认前不要发 `confirmed:true`。

**cook → 训记饮食定时同步例外**：来自 `schedule`/定时任务的每日同步，如果 `data/sync/cook-diet-sync.json` 未标记今天为 `ok`，可先展示 cook 数据摘要，然后直接 run `diet.py upsert ... --confirm` 完成写入，不需要再等待聊天确认；成功后立即更新幂等标记。其他人工发起的饮食写操作仍严格走上面的确认流程。

## 限频与错误处理

- 同一 key 同一 endpoint 15 秒一次（训练 `--full` 读取 30 秒、写回 45 秒）；`too frequent` 时脚本已自动等待 `retry_after_ms` 重试。
- `apikey missing` / `apikey invalid`：告诉用户回训记 App 重新申请 Key，再复制并重新发送最新 Skill。
- `仅VIP可用`：当前账号需要会员权限。
- `version conflict`（个人模板）：先重新 `sync`，把冲突展示给用户再询问。
- `content safety rejected`：文本未通过训记内容安全检查，请用户提供安全替代文案，不要混淆文字后自动重试。

## 代理工作守则

- **只调用 `scripts/` 下已存在的脚本**；不要用 curl、不要编写新脚本后 run。若缺能力，如实说明。
- 查询先确定日期：先 run `scripts/now.py` 拿今天；再按用户需求给 `--start/--end`。
- 身体指标属个人健康数据：分析趋势保持谨慎，不做医疗诊断；写操作严格走确认流程。
- 读取结果按「日期范围 + 类型」在对话内缓存，相同查询不要重复请求。
- 不确定动作名、食物匹配、单位、份量或模板递增规则时，先问用户，不要编造。
- 回复语言：简体中文；多用表格与结构化列表，关键数值（重量 / 体重 / 热量 / 日期）必须准确可溯源。
