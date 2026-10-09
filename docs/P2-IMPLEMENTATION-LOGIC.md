# P2 实现逻辑：阶段定义与项目状态

> 状态：P2 实现逻辑文档。
> 目标：实现 `phases.yml` 加载与校验、项目根解析、`state.json` 读写和项目级写锁。
> 不包含：证据执行（P3）、工具面（P4）、投影（P5）、客户端 UI（P6）。

## 1. 代码模块

| 模块 | 文件 | 职责 |
|---|---|---|
| YAML 子集解析 | `lib/yaml-subset.js` | 解析冻结 schema 所需的 YAML 子集 |
| 阶段 schema | `lib/phases/schema.js` | 校验、规范化、合并阶段定义 |
| 阶段 loader | `lib/phases/loader.js` | 读取默认 + 项目覆盖，绑定检查文件 |
| 默认阶段 | `phases.default.yml` | M0–M8 默认结构 |
| 项目根 | `lib/project-root.js` | 从 cwd 向上找 marker |
| 状态 schema | `lib/state/schema.js` | 校验 `state.json` |
| 状态 store | `lib/state/store.js` | 读、原子写、read-modify-write |
| 项目锁 | `lib/state/lock.js` | 同进程串行 + 跨进程锁文件 |
| 错误类型 | `lib/errors.js` | `PhaseGateError` + P0 错误码 |

## 2. 文档优先检索记录

实现前检索：

- `docs/CONTRACTS.md`：P0 冻结的 phases/state/lock 契约。
- `<user-home>\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-agent-instructions\lib\index.js`：宿主 `findProjectRoot` 同构实现。
- `<dsh-workspace>\AGENTS.md`：项目闸门和 PowerShell 5.1 约束。
- DSH 自带的 `js-yaml` 版本和 link 安装依赖解析事实。

结论：

1. 宿主有 `js-yaml` 依赖，但它不在 profile 顶层，也不保证 link 包能解析。
2. 为避免 P2 引入新的安装依赖和 profile 变更，P2 实现严格的 YAML 子集解析器。
3. 解析器只支持冻结 schema 所需结构；不支持的 YAML 特性 fail closed。
4. 项目根解析复用宿主“从 cwd 向上第一个 marker”的语义。
5. `state.json` 只保存 declared/history/defer，不保存 evidenced/gap/next。

## 3. YAML 子集解析逻辑

支持：

- block mapping
- block sequence
- `key: value`
- `- scalar`
- `- key: value` + continuation keys
- 单引号、双引号、普通字符串
- 整数、布尔、null
- 内联数组 `[a, b]`
- JSON-compatible YAML
- 注释和文档分隔线 `---` / `...`

拒绝：

- tab 缩进
- block scalar `|` / `>`
- inline map `{...}`
- unterminated quoted string
- 不支持的缩进跳跃
- 解析后残留未消费行

理由：阶段定义必须 fail closed，不能静默误读。

## 4. 阶段 schema 逻辑

`normalizePhasesDocument(document)`：

1. 文档必须是对象。
2. `version` 必须等于 `PHASES_VERSION`。
3. `phases` 必须是非空数组。
4. `id` 非空且唯一。
5. `name` 非空。
6. `exit.checks` 必须是 `NNN` 形式。
7. `exit.artifacts` 必须是项目相对路径。
8. `commonPitfalls` 可省略，省略时规范化为 `[]`。
9. 返回深冻结对象。

`mergePhasesDocuments(defaultDoc, projectDoc)`：

- 默认文档为基线。
- 项目阶段按 id 覆盖已有阶段。
- 新 id 追加到末尾。
- `supersedes` 拼接。
- 返回规范化后的完整文档。

`bindCheckFiles(document, checkFiles)`：

- 只考虑 `.ps1` 文件。
- 每个检查前缀必须恰好匹配一个 `NNN-*.ps1`。
- 一个检查文件不得被多个阶段共享。
- 返回 `prefix -> fileName` 绑定。

## 5. 默认阶段定义

`phases.default.yml` 定义 M0–M8：

- M0 问题定义与验收指标
- M1 数据接入与来源记录
- M2 数据验证与切分
- M3 参照与基线
- M4 训练与模型选择
- M5 评估与误差分析
- M6 稳健性与污染检查
- M7 可复现打包
- M8 交付与签收

默认 `checks` 和 `artifacts` 为空。原因：

- 默认流程是结构骨架，不声称项目已有证据。
- 项目必须提供自己的 `phases.yml` 覆盖，把阶段绑定到真实 `work/checks/*.ps1`。
- P4 会把“空检查”视为不可推进，而不是自动通过。

## 6. 项目根逻辑

`findProjectRoot(cwd, markers)`：

1. 要求 `cwd` 是绝对路径。
2. 对 cwd 做 `realpath`，失败时回退 `resolve`。
3. 从 cwd 向父目录遍历。
4. 找到第一个存在的 marker 即返回。
5. 到根仍未找到则返回 `null`。

默认 markers：

```text
.dsh-ml-phase
work/verify.cmd
```

辅助函数：

- `isSamePath`
- `isPathInside`
- Windows 比较统一大小写。

## 7. 状态 schema 逻辑

`normalizeStateDocument(document)`：

1. 文档必须是对象。
2. 顶层不得出现 `evidenced` / `gap` / `next`。
3. `version` 必须等于 `STATE_VERSION`。
4. `declared` 必须非空。
5. `history` 每个条目必须有 `from` / `to` / `at` / `evidenceSnapshot`。
6. `defer` 必须是 null 或 `{reason, by, at, scope?}`。
7. 返回深冻结对象。

`createInitialState(declared = 'M0')` 只用于未来显式状态创建；P2 的 `readState` 对缺失文件仍返回 `null`。

## 8. 状态 store 逻辑

`readState(projectRoot)`：

- 缺失 `state.json` => `null`。
- 无效 JSON => `E_STATE_CORRUPT`。
- 无效 schema => `E_STATE_CORRUPT`。

`writeStateAtomic(projectRoot, state)`：

1. 规范化 state。
2. 确保 `.dsh-ml-phase` 目录存在。
3. 写同目录 temp 文件。
4. `rename` 到 `state.json`。
5. 若平台拒绝 rename-over-existing，则同目录 copy 后删除 temp。
6. 返回规范化 state。

`updateState(projectRoot, updater)`：

- 在项目锁内执行 read-modify-write。

## 9. 项目锁逻辑

`withProjectLock`：

- 同进程同项目写者通过 promise queue 串行。
- 跨进程通过 `.dsh-ml-phase/state.lock` 文件守卫。
- 新鲜锁冲突 => `E_WRITE_CONFLICT`。
- 过期锁（默认 120 秒）=> 自动回收。
- release 只删除自己 token 对应的锁文件。

这不是分布式锁；它只保护 DSH 主机进程和相邻进程的项目状态写入。

## 10. P2 完成定义

- 45 项 P0 + P1 + P2 测试通过。
- 默认阶段文件能被解析和规范化。
- 项目覆盖能按 id 合并。
- 检查前缀能绑定到唯一 ps1 文件。
- 项目根能从嵌套目录向上查找。
- 缺失状态返回 null。
- 损坏状态 fail loud。
- 原子写和项目锁测试通过。
- Claude Code 对抗评审完成，P2 blocker 闭合。

