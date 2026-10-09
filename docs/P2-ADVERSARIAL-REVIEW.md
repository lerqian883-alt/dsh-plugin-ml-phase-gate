# P2 对抗式评审记录

> 评审工具：Claude Code CLI 2.1.289。
> 评审模式：只读、对抗式、尝试证伪。
> 原始输出：`docs/P2-ADVERSARIAL-REVIEW.raw.md`、`docs/P2-ADVERSARIAL-REVIEW.round2.raw.md`。
> 评审边界：只检查 P2，不进入 P3/P4/P5/P6。

## 1. 首轮结论

**有条件通过**。

P2 结构、合并、绑定、项目根和 fail-loud 语义基本正确且无越界。首轮发现 5 个 P2 必修项。

## 2. P2 必修项与处置

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P2-R01 | 高 | stale 锁回收把空/坏锁文件判为无限龄，可能误删刚创建但尚未写入的锁 | 已修：不可解析锁按新鲜冲突处理；只有可解析且明确过期才回收 |
| P2-R02 | 高 | `writeStateAtomic` fallback 先副作用后过滤错误，可能“已写盘却报失败”并泄漏 temp | 已修：先判白名单错误码；copy 失败清理 temp 后抛出真实错误 |
| P2-R03 | 中 | YAML `#` 在无前导空白时也被当注释，`version: 1#x` 会被静默截断 | 已修：只有行首或前一字符为空白时才是注释 |
| P2-R04 | 中 | `evidenceSnapshot` 条目无形状校验，数组/标量被静默变形 | 已修：每条经 CheckResult 校验并深冻结 |
| P2-R05 | 中 | “检查文件不得跨阶段共享”无测试覆盖 | 已补共享检查拒绝测试 |

## 3. 额外修复

第二轮指出的非 blocker 风险中，直接修复：

- 序列项首键与续行重复键现在 fail closed。
- stale 锁 `unlink` 失败增加一次重试上限，不会无限挂起。
- YAML anchors / aliases / tags 改为 fail closed。
- YAML BOM 显式处理。
- 检查前缀收紧为恰好 `NNN`。

## 4. 第二轮结论

**通过**。

- 首轮 5 个 P2 必修项全部闭合。
- 未发现新的 P2 blocker。
- P2 未注册工具、投影、注入或客户端槽位。
- P0 契约与 P1 安装链未被破坏。

## 5. 仍保留的后续风险

- `copyFile` fallback 仍有一个很小的非原子窗口。
- 坏锁文件不会自动自愈；会 fail loud 并给出 lockPath。
- `state.json` 尚无 fsync。
- `projectStateFile` 配置尚未接入 P5 的调用点。
- 默认阶段 checks 为空，P3/P4 必须视为不可推进。
