# P4 判定引擎与工具验收

> P4 范围：PhaseEvaluation、迁移分类、四个工具、工具注册、项目锁接入。
> 不包含：P5 投影、P6 客户端 UI、L4 产物印记。

## 1. P4 任务清单

| 编号 | 任务 | 交付物 | 状态 |
|---|---|---|---|
| P4.1 | 实现 PhaseEvaluation 与迁移分类 | `lib/engine/evaluate.js` | 完成 |
| P4.2 | 实现工具 schema 与 helpers | `lib/tools/schemas.js`、`lib/tools/helpers.js` | 完成 |
| P4.3 | 实现 `ml_phase_status` | `lib/tools/status.js` | 完成 |
| P4.4 | 实现 `ml_phase_advance` | `lib/tools/advance.js` | 完成 |
| P4.5 | 实现 `ml_phase_defer` | `lib/tools/defer.js` | 完成 |
| P4.6 | 实现 `ml_phase_phases` 与注册 | `lib/tools/phases.js`、`lib/tools/index.js`、`lib/index.js` | 完成 |
| P4.7 | 接入项目锁与契约修正 | `withProjectLock`、`docs/CONTRACTS.md` | 完成 |
| P4.8 | Claude Code 对抗评审 | `docs/P4-ADVERSARIAL-REVIEW.md` | 完成 |

## 2. 本地验收

命令：

```powershell
node --test --test-isolation=none test/p0-contracts.test.mjs test/p1-skeleton.test.mjs test/p2-yaml.test.mjs test/p2-phases.test.mjs test/p2-project-root.test.mjs test/p2-state.test.mjs test/p3-evidence.test.mjs test/p4-tools.test.mjs
```

结果：

```text
tests 78
pass 78
fail 0
```

P4 测试覆盖：

- PhaseEvaluation 的 declared/evidenced/gap/next/blockers。
- forward/rollback/noop/skip 分类。
- 四个冻结工具名。
- status 正确返回 declared/evidenced/gap/next。
- advance 目标失败不写盘。
- advance artifact 缺失不写盘。
- advance 目标通过后写 state、history、清除 defer。
- advance 禁止跳阶段。
- rollback 必须 reason，并写入历史。
- defer set/clear 可见且留痕。
- phases 返回定义和 evidence-based next。
- projectRoot 只允许会话派生根。
- 无 state 时 advance 到首阶段可初始化。
- 锁冲突返回 `E_WRITE_CONFLICT`。
- 锁等待期间 declared 变化返回 `E_WRITE_CONFLICT`。
- P4 契约修正已落文档并有测试。

## 3. 核心实现裁决

1. `status`/`phases` 使用完整证据前缀；`advance` 使用目标前的截断证据前缀 + 目标阶段完整证据。
2. `advance` 失败绝不写 state。
3. `advance` 成功清除 defer。
4. `defer` 不改变 evidenced/gap。
5. `advance`/`defer` 的 read-modify-write 接入 `withProjectLock`。
6. `advance` 在锁内重读 state，发现 declared 变化时返回 `E_WRITE_CONFLICT`。
7. 四个工具通过 `lib/index.js` 的 effect 注册，可卸载。
8. `projectRoot` 只能省略或等于会话派生根。

## 4. P1 安装链回归

P4 未新增依赖，未修改 `main` / `exports` / `dsh.bundle.patch`。同步真实插件目录后：

- `dsh plugin --profile web add link:<plugin>` 成功。
- `dsh --profile web --dump-config` 仍出现 `id: ml-phase-gate`。

## 5. 边界与后续风险

- P5 必须把成功 advance 的整值快照推进会话日志；P4 尚未写会话事件。
- 工具输出形状已通过 P4 契约修正记录在 `docs/CONTRACTS.md`。
- status/phases 的 `next` 是证据视角；advance 唯一允许的目标是 declared 的 immediate next。gap>0 时以 rollback 修正 declared 必须带 reason。
- 真实 DSH 宿主上的工具注册、output schema 和工具卡渲染仍需 P5/P6 集成冒烟。
- `advance` 持锁期间运行证据，最坏时延由检查超时和 P5 节流策略约束。
- defer 的 evaluation 在释放锁后计算，可能被并发写者刷新；state 写入本身在锁内一致。

## 6. P4 退出条件

- 78 项 P0–P4 测试通过。
- 四个工具已注册且可卸载。
- forward advance 由证据硬门控。
- 失败 advance 不写盘。
- rollback 必须 reason。
- defer set/clear 留痕且可见。
- 项目锁和 P4 契约修正已闭环。
- Claude Code 对抗评审完成，P4 blocker 闭合。
