# P5 实现逻辑：注入与投影桥

> 状态：P5 实现逻辑文档。
> 目标：把磁盘项目真相桥接为会话投影 `mlPhase`，并通过 `agent/pre-step` 和工具 deferred context 播种。
> 不包含：P6 客户端 UI、L4 产物印记。

## 1. 代码模块

| 模块 | 文件 | 职责 |
|---|---|---|
| 快照 codec | `lib/snapshot/codec.js` | build/encode/decode/fingerprint |
| 快照消息 | `lib/snapshot/message.js` | user/message 构造、deferContext |
| 投影 schema | `lib/projection/schemas.js` | Zod-compatible `.parse` 适配器 |
| 投影定义 | `lib/projection/definition.js` | mlPhase 纯 fold 注册 |
| 注入渲染 | `lib/inject/render.js` | 当前相位 + 下一出口提示文本 |
| pre-step | `lib/inject/pre-step.js` | 读盘、算 evidence、播种与节流 |
| 主入口 | `lib/index.js` | 注册 tools、projection、pre-step |

## 2. 文档优先检索记录

实现前核对：

- `dsh-session-projection/lib/index.js`：宿主只调用 `stateSchema.parse` / `viewSchema.parse`，没有 `instanceof ZodType` 检查。
- `dsh-time-context/lib/index.js`：`agent/pre-step` 返回 decision.messages 的官方先例。
- `dsh-agent-loop/lib/index.js`：pre-step 返回的 messages 会以 `session.append('user/message', message, { surfaceOp: 'append' })` 落日志。
- `dsh-tools` `ToolRunContext.deferContext`：工具内部产生的 plugin context 在 tool result 后进入 loop。
- P0 `docs/CONTRACTS.md` §2.8/§2.9：快照与投影契约。

## 3. 快照逻辑

`buildSnapshot(evaluation, phases)`：

- `declared` 为 null => 返回 null，不播种。
- `declared` 不在 phases 中 => 返回 null。
- 否则生成 version、phaseId、index、phases、evidenced、gap、next、deferred、deferReason、updatedAt。

`fingerprint(snapshot)`：

- 忽略 `updatedAt`。
- 只比较语义字段。
- 这是“投影是否过期”的唯一判据。

`encodeSnapshot`：

```json
{
  "kind": "ml-phase-gate",
  "form": "snapshot",
  "sections": [{ "name": "ml-phase-gate", "text": "<json snapshot>" }]
}
```

`decodeSnapshot`：

- 校验 kind/form/section name。
- JSON parse。
- 校验 version、phaseId、index、phases、evidenced、gap、next、deferred、deferReason、updatedAt。
- 失败返回 null，不抛异常。

## 4. 投影逻辑

`createProjectionDefinition()`：

- key = `mlPhase`。
- stateSchema = nullable snapshot parser。
- init = `() => null`。
- apply：
  - 非 `user/message` => 返回同一 state 引用。
  - source.kind 非本插件 => 返回同一 state 引用。
  - decode 成功 => 整值替换。
  - decode 失败 => 保留旧 state。
- wire.viewSchema = nullable snapshot parser。
- stateVersion = 1。

Zod 兼容：

- 宿主运行时只调用 `.parse(value)`。
- P5 提供 `{ parse }` 适配器，不新增 zod 依赖。
- 如果宿主未来改为 instanceof 校验，需要重新引入 zod 依赖并 bump P0 契约。

## 5. pre-step 播种逻辑

`computeAgentSnapshot(agent, config)`：

1. 从 `agent.session.header.cwd` 取 cwd。
2. `findProjectRoot`。
3. `loadPhases` + `readState`。
4. 无 state => 返回 null。
5. `runEvidencePrefix`。
6. `evaluatePhase`。
7. `buildSnapshot`。

`createPreStepHandler(ctx, config)`：

1. `await next()`。
2. reject / aborted => 直接返回。
3. 取 session。
4. 如果 cache 在 `preStepThrottleMs` 内则复用，否则重新计算。
5. 无 snapshot => 不注入，投影保持 null。
6. 读取 `ctx.sessionProjections.stateOf(session, 'mlPhase')`。
7. current 与 snapshot fingerprint 相同 => 不注入。
8. 不同或 current 为 null => 注入完整 user/message。
9. 返回 `{...decision, messages:[...decision.messages, message]}`。
10. 任何读盘/检查错误只 log warn，不把宿主 pre-step 打挂。

节流语义：

- `preStepThrottleMs = 0` 表示每次重新计算。
- 大于 0 时，在 TTL 内复用上次计算结果。
- fingerprint 变化时，TTL 到期后的下一轮会重播。

## 6. 工具桥逻辑

工具成功推进或 defer 后必须把新快照送入会话：

- 使用 `exec.deferContext(createSnapshotMessage(...))`。
- 不使用 `session.append` 直接抢在 tool result 前写入。
- deferContext 由 DSH 在 tool result 之后按序进入 loop。
- `advance` 的 rollback/forward 成功路径调用。
- `defer` 的 set/clear 成功路径调用。
- noop/失败路径不发送快照。

## 7. 测试策略

- codec：build/null、round-trip、fingerprint 忽略时间。
- schema：null 合法、坏对象非法。
- projection：只折本插件 source；其他事件返回同一引用。
- registerProjection：注册 key。
- computeAgentSnapshot：真实 fixture 读盘 + 证据。
- pre-step：首次播种、同指纹抑制、declared 变化重播。
- advance：成功后 deferContext 带 mlPhase snapshot。
- P5 集成测试需要真实派生 verify.cmd。

## 8. P5 完成定义

- P0–P5 全量 87 项测试通过。
- 投影注册 `mlPhase`，init=null，wire 可空。
- pre-step 首次播种、同指纹抑制、变化重播。
- advance/defer 成功通过 deferContext 送快照。
- 无 state 时不播种。
- Claude Code 对抗评审完成，P5 blocker 闭合。
- P1 安装链保持。
