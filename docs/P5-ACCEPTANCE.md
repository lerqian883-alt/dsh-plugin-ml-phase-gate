# P5 注入与投影桥验收

> P5 范围：agent/pre-step 注入、user/message 快照、mlPhase 投影、工具成功后的 deferred snapshot。
> 不包含：P6 客户端 UI、L4 产物印记。

## 1. P5 任务清单

| 编号 | 任务 | 交付物 | 状态 |
|---|---|---|---|
| P5.1 | 实现快照 codec | `lib/snapshot/codec.js` | 完成 |
| P5.2 | 实现快照消息与 deferContext | `lib/snapshot/message.js` | 完成 |
| P5.3 | 实现 Zod-compatible schema 适配器 | `lib/projection/schemas.js` | 完成 |
| P5.4 | 实现 mlPhase 投影 | `lib/projection/definition.js` | 完成 |
| P5.5 | 实现 pre-step 播种、指纹与节流 | `lib/inject/pre-step.js`、`lib/inject/cache.js` | 完成 |
| P5.6 | 接入主入口 | `lib/index.js` | 完成 |
| P5.7 | 工具成功发送 deferred snapshot | `lib/tools/advance.js`、`lib/tools/defer.js` | 完成 |
| P5.8 | Claude Code 对抗评审 | `docs/P5-ADVERSARIAL-REVIEW.md` | 完成 |

## 2. 本地验收

命令：

```powershell
node --test --test-isolation=none test/p0-contracts.test.mjs test/p1-skeleton.test.mjs test/p2-yaml.test.mjs test/p2-phases.test.mjs test/p2-project-root.test.mjs test/p2-state.test.mjs test/p3-evidence.test.mjs test/p4-tools.test.mjs test/p5-projection.test.mjs
```

结果：

```text
tests 94
pass 94
fail 0
```

P5 测试覆盖：

- buildSnapshot：无 state 返回 null。
- encode/decode round-trip。
- fingerprint 忽略 updatedAt。
- schema parse/safeParse、null 合法、坏值非法。
- projection 只折本插件 user/message。
- 无关事件保持同一引用。
- 坏 source 保留旧投影。
- registerProjection 注册 mlPhase。
- computeAgentSnapshot 真实 fixture 读盘 + 证据。
- pre-step 首次播种、同指纹抑制、declared 变化重播。
- 无 state 不播种。
- throttle>0 缓存命中与工具成功后失效。
- advance/defer 成功后 deferContext 发送快照。
- advance noop/失败不发快照。
- reject/abort/decision.messages 缺失。

## 3. 核心实现裁决

1. `mlPhase` 投影是纯 fold：
   - `init = () => null`
   - 只处理 `user/message` 且 `source.kind === ml-phase-gate`
   - 不关心事件返回同一引用
2. 投影 schema：
   - 宿主运行时只调用 `.parse`
   - P5 提供 `.parse` + `.safeParse` 适配器
   - 不新增 zod 依赖
3. 播种：
   - 无 state 不播种。
   - snapshot fingerprint 忽略 `updatedAt`。
   - 同指纹不重复注入。
   - declared/evidenced/gap/next/defer 变化触发重播。
4. 缓存：
   - pre-step TTL 缓存按 session 隔离。
   - 工具成功 deferContext 时失效缓存，防止旧快照覆盖新投影。
5. 工具桥：
   - advance rollback/forward 成功发送快照。
   - defer set/clear 成功发送快照。
   - noop/失败不发。
6. defer 的 evidence/evaluation/snapshot 已在项目锁内完成。

## 4. P1-P4 回归

- P1 schema/inject 已更新为 `tools + sessionProjections`。
- P4 advance/defer 输出形状未变。
- P4 工具注册仍可用。
- P1 安装链未新增依赖。

最终同步后执行：

```powershell
dsh plugin --profile web add link:<plugin>
dsh --profile web --dump-config
```

组合树仍出现 `id: ml-phase-gate`。

## 5. 边界与后续风险

- 真实 DSH 宿主上 pre-step、projection 和 deferContext 的端到端顺序仍需实际冒烟。
- 工具与 pre-step 若拿到不同 session 对象，缓存失效可能落空；当前按 `exec.agent.session` / `agent.session` 同一对象假设。
- 外部直接修改 `state.json` 不触发缓存失效，TTL 窗口内可能短暂展示旧快照。
- pre-step 每个 TTL 周期会跑一次完整证据前缀；慢检查需要调大 `preStepThrottleMs` 或后续优化。
- `mlPhase` 投影只到宿主机侧，P6 才渲染客户端 UI。

## 6. P5 退出条件

- 94 项 P0–P5 测试通过。
- `mlPhase` 投影注册且可空。
- pre-step 首次播种、指纹去重、变化重播。
- 工具成功后 deferred snapshot。
- 无 state 不播种。
- 缓存不会把旧快照覆盖到新投影。
- Claude Code 对抗评审完成，P5 blocker 闭合。
