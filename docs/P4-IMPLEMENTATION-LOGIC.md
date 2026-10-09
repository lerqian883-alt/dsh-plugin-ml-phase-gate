# P4 实现逻辑：判定引擎与工具

> 状态：P4 实现逻辑文档。
> 目标：把 P2 阶段/状态与 P3 证据闸门接起来，暴露四个工具。
> 不包含：P5 投影、P6 客户端 UI、L4 产物印记。

## 1. 代码模块

| 模块 | 文件 | 职责 |
|---|---|---|
| 判定引擎 | `lib/engine/evaluate.js` | declared/evidenced/gap/next/blockers、迁移分类、历史状态 |
| 工具 schema | `lib/tools/schemas.js` | 标准 JSON Schema 输入输出 |
| 工具 helpers | `lib/tools/helpers.js` | session cwd、projectRoot、项目加载 |
| status | `lib/tools/status.js` | `ml_phase_status` |
| advance | `lib/tools/advance.js` | `ml_phase_advance` |
| defer | `lib/tools/defer.js` | `ml_phase_defer` |
| phases | `lib/tools/phases.js` | `ml_phase_phases` |
| 注册 | `lib/tools/index.js` | `registerTools` |

## 2. 文档优先检索记录

实现前核对：

- `dsh-tools/lib/types/index.d.ts`：`ToolDefinition`、`output.schema/render`、`execute(args, exec)`。
- `dsh-tool-todo/lib/index.js`：工具参数、输出 schema、`presentCall`。
- `dsh-tool-fs/lib/types/session-cwd.d.ts`：`exec.agent?.session.header.cwd`。
- P0 `docs/CONTRACTS.md` §2.10：四个工具的语义、迁移规则和 defer 规则。
- P2 `loadPhases` / `readState` / `writeStateAtomic`。
- P3 `runEvidencePrefix` / `runStageEvidence`。

结论：

- 工具 execute 从 `exec.agent.session.header.cwd` 取会话工作目录。
- 不 import `@deepseek-ai/dsh-tools`，注册普通 ToolDefinition 对象，保持零新增依赖。
- 参数与输出使用标准 JSON Schema。执行体额外做轻量必需字段校验。

## 3. 判定引擎

### 3.1 `evaluatePhase`

- `declared = state?.declared ?? null`。
- `evidenced = evidence?.evidenced ?? null`。
- `declared` 或 `evidenced` 不在 phases 中 => `E_STATE_CORRUPT`。
- `gap = max(0, index(declared) - index(evidenced))`；任一为 null 时 gap=0。
- `next = evidenced 的下一阶段`；evidenced=null 时为第一阶段。
- `blockers = 首个失败阶段 evaluation.blockers`。
- `deferred/deferReason` 来自 state。
- 返回后立即冻结。

### 3.2 `classifyTransition`

- target 不在 phases => invalid。
- target == declared => noop。
- target < declared => rollback。
- target > declared+1 => invalid skip。
- target == declared+1 时，再要求 target == next(priorEvidence)；否则 invalid。
- 这样既禁止跳阶段，也禁止用 forward 掩盖证据缺口。

### 3.3 证据合并

`mergeEvidenceForAdvance(baseEvidence, targetEvidence, targetId)`：

- 用目标阶段的通过结果替换 base 中该阶段的失败结果。
- `evidenced = targetId`。
- `stoppedAt = null`。
- 返回冻结对象。

### 3.4 历史状态

`buildHistoryState(state, to, evidenceSnapshot, reason)`：

- 追加 `{from, to, at, reason, evidenceSnapshot, defer}`。
- 成功推进清除 `state.defer`。
- 无 state 时创建 version=1、declared=to、history=[entry]、defer=null。

## 4. 工具 helpers

`loadProject(exec, config, args)`：

1. `exec.agent.session.header.cwd`。
2. `findProjectRoot` 向上找 marker。
3. `args.projectRoot` 只能省略或等于派生根；否则 `E_PROJECT_ROOT_FORBIDDEN`。
4. `loadPhases` 加载默认 + 项目覆盖并绑定检查。
5. `readState` 读取项目状态。

## 5. 工具语义

### 5.1 `ml_phase_status`

- 只读。
- 跑证据前缀，返回 PhaseEvaluation。
- 无 state 时 declared=null，不抛异常。

### 5.2 `ml_phase_advance`

输入：`{to, reason?, projectRoot?}`。

逻辑：

1. 计算 declaredIndex 与 targetIndex。
2. 分类 noop / rollback / forward / invalid。
3. rollback：必须 reason；写历史，不要求目标出口检查通过。
4. forward：
   - 先跑目标之前的证据前缀 `maxStages=targetIndex`。
   - 校验 target == next(priorEvidence)。
   - 跑目标阶段完整证据。
   - 目标失败：不写盘，返回 blockers + raw。
   - 目标通过：写 state、清除 defer、更新历史，返回 evaluation。
5. noop：返回当前状态和证据评估。

硬约束：

- 检查失败绝不写 state。
- 跳阶段返回 `E_INVALID_TRANSITION`。
- rollback 必须有 reason。
- 成功 advance 清除 defer。

### 5.3 `ml_phase_defer`

- reason 必填，set/clear 都保留历史。
- `by` 用 `exec.agent.id`；缺失时 `unknown`。
- set 写入 `{reason, by, at, scope?}`。
- clear 写 defer=null，并记录先前 defer。
- defer 不改变 evidenced/gap。

### 5.4 `ml_phase_phases`

- 返回阶段定义、当前 evidence-based next definition、evaluation。
- 默认 + 项目覆盖后的完整 phases 列表。

## 6. 注册与生命周期

- `lib/index.js` `inject=['tools']`。
- P4 apply 在 effect 内调用 `registerTools`。
- 卸载时逐一调用工具 disposer。
- 无 `ctx.tools.register` 的测试上下文可跳过注册，但真实 DSH 必须提供 tools 服务。

## 7. 测试策略

- 引擎纯函数：评估、迁移分类。
- 工具列表：四个冻结工具名。
- 真实 fixture：默认+项目覆盖、真实 verify.cmd、真实 state 写盘。
- status：declared/evidenced/gap/next。
- advance：目标失败、artifact 缺失、目标通过、跳阶段、rollback、无 state 初始化。
- defer：set/clear 与 evaluation 可见性。
- phases：定义和 evidence-based next。
- projectRoot：只允许会话派生根。

P4 测试需要真实派生 verify.cmd，因此必须允许进程派生。

## 8. P4 完成定义

- P0–P4 全量 75 项测试通过。
- 四个工具可注册、可执行、可卸载。
- forward advance 由证据硬门控。
- 失败 advance 不写盘。
- rollback 必须 reason。
- defer set/clear 留痕且可见。
- Claude Code 对抗评审完成，P4 blocker 闭合。
- P1 安装链保持。
