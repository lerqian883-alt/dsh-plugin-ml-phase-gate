# P4 对抗式评审记录

> 评审工具：Claude Code CLI 2.1.289。
> 评审模式：只读、对抗式、尝试证伪。
> 原始输出：`docs/P4-ADVERSARIAL-REVIEW.raw.md`、`docs/P4-ADVERSARIAL-REVIEW.round2.raw.md`。
> 评审边界：只检查 P4，不进入 P5/P6。

## 1. 首轮结论

**有条件通过**。

判定引擎闭合性、失败不写盘、禁跳阶段、projectRoot 收敛等核心不变量成立，但有两个 P4 必修项。

## 2. P4 必修项与处置

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P4-R01 | 高 | advance/defer 的读-改-写绕过 `withProjectLock`，并发时可能丢 history、覆盖 declared，且 `E_WRITE_CONFLICT` 不可达 | advance/defer 均已接入 `withProjectLock`；advance 在锁内重读 state 并检测 declared 变化，冲突时返回 `E_WRITE_CONFLICT` |
| P4-R02 | 中高 | advance/phases/defer 输出形状偏离 P0 冻结契约 | 已在 `docs/CONTRACTS.md` 增加“P4 契约修正”，明确 `to/from/error/evaluation`、phases 的 `evaluation`、defer 输出与锁规则；P4 测试断言修正节存在 |

## 3. 额外修复

- 锁等待期间 declared 变化现在有直接测试。
- unknown-phase 失败输出补上 `from`。
- 空白 rollback reason 被拒绝。
- `presentCall` 使用 `args?.`，避免缺参时报错。
- 工具锁定测试覆盖新鲜文件锁冲突。

## 4. 第二轮结论

**通过**。

- 首轮两个 P4 必修项全部闭合。
- 未发现新的 P4 blocker。
- 四个工具仍在 `lib/index.js` effect 内注册。
- projectRoot 仍只允许会话派生根。
- advance 失败路径仍不写 state。
- P0-P3 契约和 P1 安装链未被破坏。

## 5. 仍保留的后续风险

- status/phases 的 `next` 是证据视角；advance 的唯一目标仍是 declared 的 immediate next。gap>0 时 advance-to-next 等价于带 reason 的 rollback。
- 成功 advance 的整值快照写入会话日志是 P5 的明确义务，P4 尚未做。
- defer 的 evaluation 在释放锁后计算，可能被并发写者刷新；state 写入本身在锁内一致。
- `writeStateAtomic` 的 Windows `copyFile` 回退仍是 P2 遗留的非原子窗口。
- 真实 DSH 宿主上的工具注册、output schema 校验和工具卡渲染仍需集成冒烟。
