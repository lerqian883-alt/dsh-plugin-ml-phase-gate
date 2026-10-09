# P5 对抗式评审记录

> 评审工具：Claude Code CLI 2.1.289。
> 评审模式：只读、对抗式、尝试证伪。
> 原始输出：`docs/P5-ADVERSARIAL-REVIEW.raw.md`、`docs/P5-ADVERSARIAL-REVIEW.round2.raw.md`。
> 评审边界：只检查 P5，不进入 P6。

## 1. 首轮结论

**有条件通过**。

注入、投影和 deferContext 桥主体正确，但有两个 P5 必修项。

## 2. P5 必修项与处置

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P5-R01 | 高 | pre-step TTL 缓存命中会把旧 X 注入回去，覆盖工具成功后形成的新 Y 投影 | 抽出 `lib/inject/cache.js`；工具成功 `deferSnapshotContext` 时按 session 失效缓存；补 throttle>0 回归测试 |
| P5-R02 | 高 | 多个关键行为无测试：defer 快照、advance noop/失败不发、无 state、throttle、decode 负向、apply 同引用、safeParse、reject/abort | 已补 7 组负向/边界测试 |

## 3. 额外修复

- `decision.messages` 缺失时改为 `[...(decision.messages ?? []), message]`。
- schema 适配器增加 `safeParse`。
- defer 的 evidence/evaluation/snapshot 收进项目锁。
- 缓存时间差使用 `Math.max(0, ...)`，避免时钟回拨延长 TTL。
- README 更新为 P5 状态。

## 4. 第二轮结论

**通过（以实际测试证据为准）**。

- 首轮两个 P5 必修项全部闭合。
- 未发现新的 P5 blocker。
- 本地实际执行 P0–P5 套件：94/94 通过。
- advance/defer 成功快照、失败/noop 不发、无 state 不播种、throttle 失效、投影同引用均有测试。
- 未发现 P6 越界。

## 5. 仍保留的后续风险

- 真实 DSH 宿主上 pre-step、projection、deferContext 的端到端顺序仍需实际冒烟。
- 工具与 pre-step 若拿到不同 session 对象，缓存失效可能落空。
- 外部直接修改 `state.json` 不触发缓存失效，TTL 窗口内可能短暂展示旧快照。
- pre-step 每个 TTL 周期会跑完整证据前缀，慢检查需要调大节流或后续优化。
- zod 适配器仅覆盖 `.parse` / `.safeParse`，绑定当前宿主使用方式；宿主升级需重验。
