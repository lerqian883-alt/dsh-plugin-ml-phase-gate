# ML Phase Gate 插件契约冻结（P0）

> 状态：P0 冻结。
> 契约版本：`CONTRACT_VERSION = 1`。
> 运行时基准：`@deepseek-ai/dsh@0.1.7-rc.2`。
> 本文与 `lib/contracts.js`、`lib/types/contracts.d.ts` 必须保持一致。

## 1. 冻结边界

本契约冻结以下内容：

1. 包名、插件名、版本。
2. 项目侧文件布局。
3. `phases.yml` 结构。
4. `state.json` 结构。
5. 检查结果结构和检查执行边界。
6. 阶段判定结果结构。
7. 会话快照和投影结构。
8. 四个工具的名字、输入、输出和迁移规则。
9. 错误码。
10. 客户端槽位和 locale 命名。

P0 不冻结具体 UI 布局像素，只冻结 UI 的数据来源、槽位和状态语义。

## 2. 数据契约

### 2.1 包身份

| 字段 | 值 |
|---|---|
| 包名 | `dsh-plugin-ml-phase-gate` |
| 插件名 | `ml-phase-gate` |
| P0 版本 | `0.0.1` |
| 模块类型 | ESM |
| 契约版本 | `1` |

### 2.2 插件配置

```ts
interface PluginConfig {
  projectPhasesFile?: string;
  projectStateFile?: string;
  projectMarkers?: string[];
  checkTimeoutMs?: number;
  preStepThrottleMs?: number;
  watchAutoRun?: boolean;
  activationMode?: 'auto' | 'always' | 'off';
  verifyCommand?: string | null;
}
```

默认值：

```js
{
  projectPhasesFile: '.dsh-ml-phase/phases.yml',
  projectStateFile: '.dsh-ml-phase/state.json',
  projectMarkers: ['.dsh-ml-phase', 'work/verify.cmd', 'work/verify.ps1', 'work/verify.mjs', 'work/verify.sh'],
  checkTimeoutMs: 120000,
  preStepThrottleMs: 5000,
  watchAutoRun: false,
  activationMode: 'auto',
  verifyCommand: null,
}
```

配置规则：

- 所有路径都相对项目根解析。
- `projectMarkers` 按顺序匹配，第一个命中即为项目根。
- `checkTimeoutMs` 必须是非负安全整数。
- `preStepThrottleMs` 必须是非负安全整数。
- `verifyCommand` 可以是 `null`、`undefined` 或项目相对路径；为 `null/undefined` 时按 `VERIFY_CANDIDATES` 自动发现。
- `VERIFY_CANDIDATES` 依次为 `work/verify.cmd`、`work/verify.ps1`、`work/verify.mjs`、`work/verify.sh`。
- 未配置时使用 `DEFAULT_CONFIG`。
- `activationMode` 只能是 `auto`、`always`、`off`。
  - `auto`：有阶段快照时显示 Dock，非 ML 项目安静降级。
  - `always`：没有快照时显示“未开始”Dock。
  - `off`：Host 不注册工具、projection、pre-step、watcher，也不注册 `mlPhaseActivation`；Client 不产生可见 Dock/Audit 内容。彻底移除静态 client bundle 使用 DSH 插件管理器禁用插件。

### 2.3 项目文件布局

```text
<project>/
  .dsh-ml-phase/
    phases.yml
    state.json
  work/
    verify.cmd
    verify.ps1
    checks/
      NNN-*.ps1
```

规则：

- `state.json` 属于审计资产，应当进入 git。
- `evidenced` 不写入磁盘。
- `phases.yml` 可以由项目覆盖插件默认流程。
- `work/checks` 由项目拥有；插件执行项目自有代码，授权边界等同 shell 工具。
- 执行检查时 `cwd` 必须是项目根。

### 2.4 `phases.yml` 契约

```yaml
version: 1
supersedes:
  - source: docs/PROJECT_FLOW.md
    replacedBy: .dsh-ml-phase/phases.yml
    reason: "文档流程与验收判据已漂移"
    at: "2026-10-08T00:00:00Z"
phases:
  - id: M0
    name: 问题定义与验收指标
    exit:
      checks: ["010"]
      artifacts: []
    commonPitfalls: []
```

字段：

| 字段 | 类型 | 必需 | 语义 |
|---|---|---|---|
| `version` | integer | 是 | 当前为 `1` |
| `supersedes` | array | 否 | 记录被取代的旧文档或旧判据 |
| `phases` | array | 是 | 至少一项 |
| `id` | string | 是 | 阶段 ID，默认 M0–M8，项目可覆盖 |
| `name` | string | 是 | 人类可读名称 |
| `exit.checks` | string[] | 是 | 检查名前缀，例如 `010` |
| `exit.artifacts` | string[] | 是 | 项目相对路径，禁止 `..` |
| `commonPitfalls` | string[] | 否 | 常见坑提示 |

校验规则：

- `version` 必须严格等于 `PHASES_VERSION`；不相等时 fail closed 并报 `E_PHASES_INVALID`。
- `id` 不得重复。
- `exit.checks` 的每个前缀按 `NNN-` 整段匹配，例如 `010` 只匹配 `010-*.ps1`。
- 一个检查前缀必须恰好匹配一个检查文件；匹配 0 个报 `E_UNKNOWN_CHECK`，匹配多个报 `E_PHASES_INVALID`。
- 不允许同一检查文件被多个阶段共享，除非未来显式引入共享检查契约。
- `exit.artifacts` 必须使用项目相对路径。
- 不允许人工判断型出口。

### 2.5 `state.json` 契约

```json
{
  "version": 1,
  "declared": "M4",
  "history": [
    {
      "from": "M3",
      "to": "M4",
      "at": "2026-10-08T00:00:00Z",
      "reason": "forward",
      "evidenceSnapshot": [],
      "defer": null
    }
  ],
  "defer": null
}
```

字段：

| 字段 | 类型 | 必需 | 语义 |
|---|---|---|---|
| `version` | integer | 是 | 当前为 `1` |
| `declared` | string | 是 | 当前声明阶段 |
| `history` | array | 是 | 迁移史，可空 |
| `defer` | object/null | 否 | 当前人工覆盖 |
| `history[].reason` | string | 否 | 前向推进、回退或 defer 的原因摘要 |
| `history[].evidenceSnapshot` | CheckResult[] | 是 | 当时证据摘要，输出必须截断 |

禁止字段：

```text
evidenced
gap
next
```

这些字段必须由判定引擎现算，不能落盘。

### 2.6 检查结果契约

```ts
interface CheckResult {
  stage: string;
  check: string;
  exitCode: number;
  status: 'pass' | 'fail' | 'skip' | 'error' | 'timeout';
  stdout: string;
  stderr: string;
  durationMs: number;
  ranAt: string;
  command?: string;
}
```

检查执行边界：

- 阶段出口的执行入口优先使用显式 `verifyCommand`；未配置时自动发现 `VERIFY_CANDIDATES`。
- 插件对每个 `exit.checks` 前缀执行一次：`<verify-entry> -Only <prefix>-`。
- 一个前缀产生一个 `CheckResult`。
- `CheckResult.check` 是该前缀，不是内部的单个子检查文件名。
- `verify.cmd` 必须支持 `-Only` 过滤；P3 必须在真实项目上验证这一点。
- 插件不自行解析 `verify.cmd` 的内部输出；以退出码判定该前缀的 status。
- 必须保留 stdout/stderr，但必须截断到有界上限；具体上限由 P3 冻结。
- `history[].evidenceSnapshot` 只保存截断后的摘要。

退出码映射：

| exit code | status |
|---|---|
| `0` | `pass` |
| `1` | `fail` |
| `2` | `skip` |
| 其他 | `error` |
| 超时 | `timeout` |

规则：

- `skip` 不等于 `pass`；阶段出口默认不接受 skip。
- 超时必须明确标记，不能算通过。
- 执行时不得用字符串拼接 shell 命令；参数必须以数组传递。

### 2.7 阶段判定契约

```ts
interface Blocker {
  stage: string;
  kind: 'check' | 'artifact';
  check: string;
  code: string;
  message: string;
}

interface PhaseEvaluation {
  version: number;
  declared: string | null;
  evidenced: string | null;
  gap: number;
  next: string | null;
  blockers: Blocker[];
  deferred: boolean;
  deferReason: string | null;
  checkedAt: string;
}
```

语义：

- `declared`：`state.json` 中的声明阶段；无状态时为 `null`。
- `evidenced`：证据连续支持的最后一个阶段；无证据时为 `null`。
- `gap`：`max(0, index(declared) - index(evidenced))`。
- 当 `declared` 或 `evidenced` 为 `null` 时，`gap = 0`。
- `declared` 为空字符串或不在 `phases.yml` 中时，报 `E_STATE_CORRUPT`，不能静默从 M0 开始。
- `next`：`evidenced` 的下一阶段；没有下一阶段时为 `null`。
- `blockers`：阻止推进的检查或工件。
- `blockers[].kind = 'artifact'` 时，`check` 字段填缺失工件路径。
- `deferred`：当前是否存在 defer。
- `deferReason`：defer 原因；未 defer 时为 `null`。

### 2.8 快照契约

```ts
interface PhaseView {
  id: string;
  name: string;
}

interface MlPhaseSnapshot {
  version: number;
  phaseId: string;
  index: number;
  phases: PhaseView[];
  evidenced: string | null;
  gap: number;
  next: string | null;
  deferred: boolean;
  deferReason: string | null;
  updatedAt: string;
}
```

播种前置条件：

- 只有当项目根存在 `state.json` 且 `declared` 非空时，才允许追加快照事件。
- 没有 `state.json` 时，不追加快照；投影保持 `null`，客户端显示“未开始”。
- 会话中途删除 `state.json`：不追加重置快照，保留最后一次投影；这是受支持但不推荐的运维动作，P5 可在 pre-step 显示 stale 警告。
- 不允许把 `phaseId` 或 `index` 改成可空来替代上述前置条件。

过期谓词：

```text
fingerprint = {
  version, phaseId, index, phases, evidenced, gap, next,
  deferred, deferReason
}
```

- 只比较 `fingerprint`，不比较 `updatedAt`。
- 投影为 `null` 且项目已有 `state.json`：播种一次。
- `fingerprint` 变化：追加快照。
- `fingerprint` 不变：不追加快照，即使时间戳变化。
- 受 `preStepThrottleMs` 节流；节流不得阻止首次播种。

快照通过 `user/message` 的 `source` 承载：

```ts
interface SnapshotSource {
  kind: 'ml-phase-gate';
  form: 'snapshot';
  sections: Array<{ name: string; text: string }>;
}
```

规则：

- `kind` 固定为 `ml-phase-gate`。
- `form` 固定为 `snapshot`。
- `sections[0].name` 固定为 `ml-phase-gate`。
- `sections[0].text` 是 `MlPhaseSnapshot` 的 JSON 字符串。
- 解码失败时返回 `null`，保留上一个投影值，不抛出未捕获异常。
- 不新增自定义会话事件类型。

### 2.9 投影契约

```ts
interface PhaseExitView {
  checks: string[];
  artifacts: string[];
  commonPitfalls: string[];
}

interface MlPhaseProjection {
  version: number;
  phaseId: string;
  index: number;
  phases: PhaseView[];
  evidenced: string | null;
  gap: number;
  next: string | null;
  deferred: boolean;
  deferReason: string | null;
  stale: boolean;
  staleAt: string | null;
  history: HistoryEntryView[];
  nextExit: PhaseExitView | null;
  updatedAt: string;
}
```

投影规则：

- 投影 key：`mlPhase`。
- `init` 返回 `null`。
- 必须提供与 `MlPhaseProjection | null` 一致的 `stateSchema`。
- 对客户端可见的注册必须提供与 `MlPhaseProjection` 一致的 `viewSchema`。
- `stateSchema` 和 `viewSchema` 都必须是可空 schema，以支持 `init = null`。
- `apply` 只处理 `user/message` 且 `source.kind === 'ml-phase-gate'` 的事件。
- 不关心的事件必须返回同一个状态引用。
- 事件携带完整状态，不能是 delta。
- 修改 fold 语义或序列化状态字段形状都必须 bump `stateVersion`。
- 客户端读取三态：`undefined`、`null`、对象。
- `PROJECTION_VERSION` 是文档级 wire 版本记录，不是宿主运行时字段。

### 2.10 工具契约

#### 通用 projectRoot 规则

- `projectRoot` 只能省略，或必须等于从 `SessionHeader.cwd` 解析出的项目根。
- 模型不能把 `projectRoot` 指向任意目录。
- 非法路径报 `E_PROJECT_ROOT_FORBIDDEN`。
- Windows 路径比较必须使用规范化绝对路径（`realpath` + 统一大小写/分隔符/尾斜杠）后再比较。
- 执行项目检查的授权边界等同 shell 工具。

#### `ml_phase_status`

输入：`{ "projectRoot": "optional derived project root" }`
输出：`PhaseEvaluation`。

#### `ml_phase_advance`

输入：`{ "to": "M4", "reason": "optional for forward, required for rollback" }`

输出：

```json
{
  "ok": true,
  "state": "ProjectState",
  "evaluation": "PhaseEvaluation"
}
```

失败输出：

```json
{
  "ok": false,
  "target": "M4",
  "blockers": "Blocker[]",
  "raw": "CheckResult[]"
}
```

合法迁移：

- 前向推进：`to === next`；跳阶段报 `E_INVALID_TRANSITION`。
- 回退或返工：`to` 是当前 `declared` 之前的阶段；必须提供 `reason`；不要求目标阶段出口检查通过；不删除历史。
- 原地推进：`to === declared` 视为 no-op，不写盘。
- 检查失败时不写 `state.json`。
- 必须返回 blockers 和原始检查输出。
- 成功后必须追加整值快照。
- 成功后必须清除 `state.defer`，并在 `history` 中记录本次推进 / defer 清除。

#### `ml_phase_defer`

输入：`{ "reason": "必须非空", "scope": "optional", "clear": false }`

语义：

- `clear = false` 或省略：设置 defer。
- `clear = true`：清除 defer，仍必须提供 reason。
- `scope` 省略时作用于当前 `declared` 阶段。
- `scope` 是覆盖标识，不是安全边界。
- `by` 由宿主侧身份填充；无身份时填 `"unknown"`，绝不由模型输入。
- defer 不改变 `evidenced`，也不能隐藏 gap 红标。
- defer 不阻止 `advance`；`advance` 仍按证据判定。
- `advance` 成功后自动清除 defer。
- defer 状态必须显示在 UI 上。

#### `ml_phase_phases`

输入：`{}`

输出：

```json
{
  "phases": "PhaseDefinition[]",
  "next": "PhaseDefinition | null"
}
```

## 3. 错误码

| 错误码 | 含义 |
|---|---|
| `E_NO_PROJECT_ROOT` | 找不到项目根 |
| `E_PHASES_INVALID` | `phases.yml` 无效 |
| `E_UNKNOWN_CHECK` | 引用了不存在的检查 |
| `E_STATE_CORRUPT` | `state.json` 损坏或声明未知阶段 |
| `E_CHECK_FAILED` | 检查失败 |
| `E_CHECK_TIMEOUT` | 检查超时 |
| `E_ARTIFACT_MISSING` | 必需工件缺失 |
| `E_WRITE_CONFLICT` | 并发写冲突；fail loud，不自动重试 |
| `E_DEFERRED` | defer 输入无效 |
| `E_PROJECTION_MISSING` | 投影能力缺席 |
| `E_SNAPSHOT_INVALID` | 快照编码或解码失败 |
| `E_INVALID_TRANSITION` | 非法阶段迁移，例如跳阶段 |
| `E_PROJECT_ROOT_FORBIDDEN` | `projectRoot` 不是当前会话派生根 |

错误处理规则：

- 无效 `phases.yml`：fail loud。
- 损坏 `state.json`：明确报错，不静默重置。
- 检查失败：不写状态，返回 blockers。
- 检查超时：按失败处理。
- 解码失败：保留旧投影，记录错误。
- 写锁冲突：返回 `E_WRITE_CONFLICT`，不自动重试。
- 写锁和节流作用域都以项目根为单位。

## 4. 客户端席位契约

```text
slot:        conversation.input.dock
id:          ml-phase
order:       5
locale:      mlPhase
projection:  mlPhase
```

注册形状：

```ts
ctx.slots.inject('conversation.input.dock', () =>
  ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'ml-phase',
    order: 5,
    locale: 'mlPhase'
  }, MlPhaseDock)
)
```

规则：

- 不得注册未声明槽位。
- 不得使用已占用的 `id`。
- 声明 locale 时必须注册字典。
- 样式必须经平台模块管线（CSS Modules）并只使用宿主 token；禁止任意全局 CSS import。
- 投影为 `undefined`：不渲染。
- 投影为 `null`：渲染“未开始”。
- 投影为对象：渲染当前阶段、gap、defer。
- 客户端不得读磁盘、跑检查或重新计算 `evidenced` / `gap`。

## 5. 版本策略

| 契约 | 当前版本 | 变化时 |
|---|---|---|
| `CONTRACT_VERSION` | `1` | 整体不兼容变更 |
| `PHASES_VERSION` | `1` | YAML schema 变化 |
| `STATE_VERSION` | `1` | state schema 或语义变化 |
| `EVALUATION_VERSION` | `1` | 判定语义变化 |
| `SNAPSHOT_VERSION` | `4` | wire shape 变化 |
| `PROJECTION_VERSION` | `4` | 文档级投影 wire 记录；无宿主运行时消费 |
| projection `stateVersion` | `4` | 序列化状态字段形状或 fold 语义变化 |

版本 bump 必须附带：

1. 变更说明。
2. 迁移策略。
3. 兼容性判断。
4. 测试更新。

## 6. 契约验收

- `lib/contracts.js` 与本文一致。
- `lib/types/contracts.d.ts` 与本文一致。
- `test/p0-contracts.test.mjs` 覆盖所有错误码、工具名、默认配置和关键联动不变量。
- 任何后续模块不得重新声明这些常量。
- 任何新增字段必须先更新本文和测试。


## P4 契约修正：工具输出与锁

P4 实现将 §2.10 的工具输出形状扩展为可诊断的完整形状。此节为 P0 契约的受控 P4 修正，后续工具卡和投影必须按此节消费。

### `ml_phase_advance`

成功输出：

```json
{
  "ok": true,
  "to": "M1",
  "from": "M0",
  "state": "ProjectState",
  "evaluation": "PhaseEvaluation"
}
```

失败输出：

```json
{
  "ok": false,
  "to": "M1",
  "from": "M0",
  "blockers": "Blocker[]",
  "raw": "CheckResult[]",
  "evaluation": "PhaseEvaluation",
  "error": { "code": "E_INVALID_TRANSITION", "message": "..." }
}
```

- `to` 取代原草案的 `target`。
- `from` 是调用前的 declared。
- `error` 仅用于非法迁移、rollback 缺 reason 等结构性失败。
- 检查失败使用 `blockers` + `raw`，仍不写 state。

### `ml_phase_phases`

输出扩展为：

```json
{
  "phases": "PhaseDefinition[]",
  "next": "PhaseDefinition | null",
  "evaluation": "PhaseEvaluation"
}
```

`next` 是 evidence-based next definition。

### `ml_phase_defer`

输出：

```json
{
  "ok": true,
  "state": "ProjectState",
  "evaluation": "PhaseEvaluation"
}
```

失败：

```json
{
  "ok": false,
  "error": { "code": "E_DEFERRED", "message": "..." }
}
```

### 写锁

- `advance` 和 `defer` 的 read-modify-write 必须接入 `withProjectLock`。
- `advance` 在锁内重读 state；若调用前声明的 declared 在等待锁期间发生变化，返回 `E_WRITE_CONFLICT`。
- 锁作用域为项目根。

## P5 契约修正：注入与投影桥

### 投影 schema 适配器

- 宿主 `sessionProjections` 运行时只调用 `stateSchema.parse` / `viewSchema.parse`。
- P5 使用 Zod-compatible `{parse}` 适配器，不新增 zod 依赖。
- 两个 schema 都接受 `null`，以支持 `init = null`。
- 如果宿主未来改为 `instanceof ZodType` 校验，需要重新引入 zod 依赖并 bump 契约。

### 播种与 fingerprint

- 无 `state.json` 时不播种，`mlPhase` 保持 null。
- snapshot fingerprint 忽略 `updatedAt`。
- fingerprint 变化才注入新的 `user/message`。
- 注入消息 source 固定为：

```json
{
  "kind": "ml-phase-gate",
  "form": "snapshot",
  "sections": [{ "name": "ml-phase-gate", "text": "<json snapshot>" }]
}
```

### 工具成功后的快照

- `advance` 的 rollback/forward 成功路径通过 `exec.deferContext` 发送整值快照。
- `defer` 的 set/clear 成功路径通过 `exec.deferContext` 发送整值快照。
- noop 和失败路径不发送快照。
- 不使用 `session.append` 在 tool result 之前抢写快照。

## P6 契约修正：客户端可视化

> 本节是 P0 冻结契约 §4 的受控 P6 修正，仅覆盖客户端交付机制与 `nextExit` 扩展；不改变“磁盘证据是真相、客户端只读投影”的边界。

### 6.1 样式交付机制

P6 采用手写 `lib/client.js` bundle，没有源码构建期，因此不能使用需要打包器解析的 CSS Modules。经 P6 对抗评审确认，允许以下受控偏离；后续如引入构建链，应优先迁移回 CSS Modules：

- 允许 React inline `style`，但仅用于布局、间距、尺寸和堆叠；禁止全局 CSS import。
- 颜色、背景、边框、圆角、阴影和文字颜色必须优先使用宿主 `--dsh-*` / `--dsw-*` token。
- 每个 CSS 变量都必须带 fallback，例如 `var(--dsw-radius-md, 8px)`；未识别的宿主变量不能让整条声明失效。
- 允许保留必要的几何/层级字面量，例如 `fontSize: 12`、`zIndex: 20`、`borderRadius: 999`；这些值不是颜色权威，必须在真机视觉门走查。
- `--dsh-composer-side-clearance` / `--dsh-composer-dock-inset` 缺失时回退到 `0px`，不得使 dock 宽度声明整体失效。

### 6.2 `nextExit` 投影扩展

`MlPhaseProjection` 增加一个可选可空的 `nextExit` 字段：

```ts
interface PhaseExitView {
  checks: string[];
  artifacts: string[];
  commonPitfalls: string[];
}
```

语义：

- `nextExit = null`：当前 `next` 不存在，或阶段定义没有可展示的下一出口信息。
- `nextExit` 非空：只展示 `next` 阶段的出口检查、工件和常见坑；不在客户端读 `phases.yml`。
- 该字段由 `buildSnapshot` 从阶段定义复制；`fingerprint` 必须包含它。
- 客户端只消费该字段，不重新运行检查、不判断出口是否通过。

### 6.3 Dock 与双游标语义

- 槽位保持 `conversation.input.dock`，注册 id=`ml-phase`，order=`5`，locale=`mlPhase`。
- `buildRailModel` 只做投影字段到视觉节点的映射：
  - evidence 游标及其左侧：已完成。
  - declared 游标：声明位置。
  - evidence 游标与 declared 游标之间：gap/error；`evidenced = null` 时不把未开始误画成 gap。
  - evidence 推导出的 next：进行中。
- `undefined` 投影：不渲染；`null`：渲染“未开始”；对象：渲染轨道、badge 和 popover。
- 客户端不得重新计算 `evidenced` / `gap`，不得读盘或派生检查结果。

### 6.4 版本迁移

- `SNAPSHOT_VERSION`：1 → 2。
- `PROJECTION_VERSION`：1 → 2。
- projection `stateVersion`：1 → 2。
- `decodeSnapshot` 继续接受 v1 快照，将其规范化为 v2 并设置 `nextExit = null`；未知版本仍返回 `null`，保留旧投影。
- 快照/投影的 `version` 字段必须与当前常量一致；已知字段形状不匹配时 fail closed。为实现向前兼容，未知额外字段会被白名单重建丢弃。

## P7 契约修正：右栏审计页

> 本节是 P0 契约 §4 的受控 P7 修正，只增加客户端席位与能力边界，不改变 P5/P6 的磁盘真相与只读投影边界。

### 7.1 新增席位

```text
slot:        sidebar.right.pane.tab
tab id:      dsh-plugin-ml-phase-gate/audit
tab kind:    ml-phase-audit
priority:    extension
locale:      mlPhase
```

注册形状：

```js
ctx.sidebarRightTabs.register({
  id: 'dsh-plugin-ml-phase-gate/audit',
  kind: 'ml-phase-audit',
  priority: 'extension',
  title: () => t('audit.title'),
  guide: [{ id: 'open', order: 30, title, description }],
});

ctx.slots.inject('sidebar.right.pane.tab', () =>
  ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: 'dsh-plugin-ml-phase-gate/audit',
    locale: 'mlPhase',
  }, MlPhaseAudit)
);
```

规则：

- tab id 必须在整个 tab registry 中全局唯一；kind 是用户打开页的类型。
- 审计正文必须只读取 `mlPhase` 投影。
- 没有 `sidebarRightTabs` 能力时不注册 tab 类型。
- 没有 `sidebarRight` 能力或 `mounted.getSnapshot()` 返回 `null`/`undefined` 时，Dock 不暴露可点击但无效的审计入口。

### 7.2 Dock 追加能力

P6 的 `conversation.input.dock` 注册可追加一个可选 `inject` 函数，用于向组件提供 `openAudit`：

```js
inject: () => ({ openAudit: () => openAuditTab(ctx) })
```

`openAudit` 是导航能力，不是投影数据：

- 只调用 `ctx.sidebarRight.openTab('ml-phase-audit')`。
- 未挂载 session 时必须安全返回，不得把异常抛进 React 事件处理。
- `openAudit` 缺席时，P6 的 Dock 必须保持原来的三态和 popover 行为。

### 7.3 P7.1 版本边界

P7.1 不 bump `SNAPSHOT_VERSION`、`PROJECTION_VERSION` 或 projection `stateVersion`，因为它消费 P6 已有投影，不新增 wire 字段。

## P7.2 契约修正：watcher 失效与 stale 标记

> P7.2.1 不做自动检查。watcher 只把已有投影标记为 stale；真实探测仍由显式 pre-step 或 `ml_phase_status` 完成。

### 11.1 stale 字段

快照和投影版本 3 新增：

```ts
stale: boolean;
staleAt: string | null;
```

语义：

- 正常计算的快照：`stale = false`、`staleAt = null`。
- watcher 检测到 `phases.yml` 或 `state.json` 变化时：保留原 evaluation 字段，写 `stale = true`、`staleAt = <ISO 时间>`。
- `fingerprint` 包含 `stale`，忽略 `staleAt`，避免同一 stale 状态重复注入。
- v1/v2 快照继续可解码，规范化为 v3 并设置 stale 默认值。

### 11.2 watcher 边界

- 默认只监听项目配置中的 `projectStateFile` 和 `projectPhasesFile`。
- 变化后：失效 pre-step 缓存，向当前 session 追加 stale snapshot message。
- **不得自动运行 `verifyCommand` 或任何 `work/checks` 脚本。**
- watcher 必须随 session/插件卸载关闭。
- 自写入窗口使用 suppression，避免工具或 status 刚提交 fresh snapshot 后又被同一写入标成 stale。
- 多 session 去重、opt-in 自动检查和 artifact watcher 属于后续独立契约，不在本修正内。

### 11.3 显式刷新

`ml_phase_status` 成功后通过 `exec.deferContext` 发送 fresh v3 snapshot。该路径：

- 先执行项目自己的 evidence prefix；
- 以 `stale = false` 覆盖旧投影；
- 失效 pre-step 缓存；
- 为 watcher 建立自写入 suppression。

### 11.4 版本迁移

- `SNAPSHOT_VERSION`：2 → 3；P7.2.2 再升至 4。
- `PROJECTION_VERSION`：2 → 3；P7.2.2 再升至 4。
- projection `stateVersion`：2 → 3；P7.2.2 再升至 4。
- v1/v2 快照可迁移到 v3；未知版本和形状不匹配仍 fail closed。

### 11.5 history 回放视图

版本 4 增加 `history: HistoryEntryView[]`：

```ts
interface HistoryEvidenceView {
  stage: string;
  check: string;
  status: string;
  exitCode: number;
}

interface HistoryEntryView {
  from: string | null;
  to: string;
  at: string;
  reason: string | null;
  deferReason: string | null;
  evidence: HistoryEvidenceView[];
}
```

规则：

- 只从 `state.json.history` 读取最近 50 条记录。
- 每条记录只投影最近 50 个 check 摘要，不投影 stdout/stderr 原文。
- audit 页只读展示，不把 UI 变化反写成项目历史。
- v1/v2/v3 迁移到 v4 时 history 默认为空；v2/v3 的 nextExit 保留。

### 11.6 项目级 watcher 与 opt-in 自动检查

- watcher 按项目根共享：同一 root 的多个 session 复用一组文件 watcher。
- 监听目标：`projectStateFile`、`projectPhasesFile`、所有 `exit.artifacts` 路径。
- `session/disposed` 只移除对应 session；最后一个 session 消失后关闭项目 watcher。
- 默认 `watchAutoRun=false`：变化只标 stale，不运行检查。
- `watchAutoRun=true` 时：每个项目根只运行一次探测，成功后向相关 session 提交 fresh snapshot；失败则保持 stale。
- 自动检查是显式 opt-in 能力，必须承担项目脚本执行风险。

### 2.10.1 activation projection

P8 新增只读激活投影：

```ts
interface MlPhaseActivation {
  mode: 'auto' | 'always';
}
```

规则：

- key 固定为 `mlPhaseActivation`。
- `activationMode=off` 时不注册。
- `init` 返回 `{ mode }`，`apply` 是恒等 fold，不处理 session 事件。
- `stateSchema` 和 `viewSchema` 只接受 `auto` 或 `always`。
- Client 缺失该投影时按 `auto` 保守处理。
- 该投影只控制 Dock/Audit 可见性，不进入 `state.json`、snapshot 或阶段迁移历史。
