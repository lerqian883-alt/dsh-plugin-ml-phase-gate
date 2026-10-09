# P0 对抗式评审记录

> 评审工具：Claude Code CLI 2.1.289。
> 评审模式：只读、对抗式、尝试证伪。
> 完整原始输出：`docs/ADVERSARIAL-REVIEW.raw.md`。
> 评审边界：不授权 Claude 修改文件；不进入 P1 实现。

## 1. 评审目标

尝试找出：

1. 架构与 DSH 宿主事实冲突。
2. 契约字段缺失或语义歧义。
3. 主机半与客户端半边界泄漏。
4. 真相源与投影镜像混淆。
5. 阶段判定算法不闭合。
6. UI 槽位或投影 key 冲突。
7. 后续实现无法落地或无法验收。
8. 安全、权限和生命周期遗漏。
9. 文档之间互相矛盾。
10. 测试只验证镜像而不验证关键不变量。

## 2. 评审提示词

```text
你是对抗式架构评审员。只读，不修改文件。
目标：尝试证伪 P0 契约冻结，找出会导致后续实现失败、歧义、冲突或无法验收的问题。
重点检查：
- 架构文档、契约文档、实现逻辑文档是否互相矛盾；
- 数据对象字段是否足以支撑 declared/evidenced/gap/next/blockers；
- projection、snapshot、state 三种版本是否职责清晰；
- 是否违反 DSH 的纯 fold、整值事件、未知事件类型、槽位注册约束；
- 客户端半是否可能偷偷重算业务；
- 测试是否只验证常量而没有验证关键不变量；
- P0 是否越界进入 P1。
输出格式：
1. 结论：通过/有条件通过/不通过；
2. 按严重度列出发现；
3. 每条发现给出证据文件与原因；
4. 给出最小修复建议；
5. 明确哪些只是后续风险，不应在 P0 修复。
```

## 3. 评审发现与处置

首轮结论：**有条件通过**。

### 3.1 P0 必须修项与处置

| 编号 | 发现 | 严重度 | P0 处置 |
|---|---|---|---|
| A-01 | 快照类型无法表达无 `state.json` 的项目 | major | 冻结：无状态不播种，投影保持 `null`，UI 显示“未开始” |
| A-02 | 投影不携带阶段序列，无法支持项目自定义阶段 | major | 快照和投影增加 `phases: PhaseView[]` |
| A-03 | `work/checks/*.ps1` 与 `work/verify.cmd` 执行边界矛盾 | major | 冻结：每个检查前缀执行一次 `work/verify.cmd -Only <prefix>` |
| A-04 | 投影注册缺 `stateSchema` / `viewSchema` 契约 | major | 要求两个 schema 均可空，并纳入 O12 |
| A-05 | defer 的效应、scope、by、解除路径未定义 | major | 定义 `clear`、`by` 由宿主填充、advance 成功后自动清除 |
| A-06 | `ml_phase_advance.to` 的合法迁移与回退未定义 | major | 前向只允许 `to === next`；回退必须带 `reason` |
| A-07 | 投影过期谓词未定义，时间戳导致每步重播 | major | 使用忽略 `updatedAt` / `checkedAt` 的 fingerprint |
| A-08 | `projectRoot` 可指向任意目录并执行脚本 | major | 只允许当前会话派生根；新增 `E_PROJECT_ROOT_FORBIDDEN` |
| A-09 | 契约测试覆盖不足 | major | 扩展为 10 项，覆盖错误码全集、工具名、默认配置和联动不变量 |
| A-10 | `Blocker.check` 无法区分检查与工件 | minor | 增加 `kind: 'check' | 'artifact'` |
| A-11 | `gap` / `index` 在 null 或未知 id 下未定义 | minor | `gap=0`；未知 declared 报 `E_STATE_CORRUPT` |
| A-12 | 工具输出只冻结名字，未冻结引用类型 | minor | 明确 `ProjectState`、`PhaseEvaluation`、`PhaseDefinition[]` 等引用 |
| A-13 | 检查前缀匹配规则有歧义 | minor | 按 `NNN-` 整段匹配；一个前缀恰好一个文件 |
| A-14 | `stateVersion` bump 规则过窄 | minor | 序列化状态字段形状或 fold 语义变化都必须 bump |
| A-15 | “不 import CSS”与官方 CSS Modules 先例冲突 | minor | 改为“平台 CSS Modules + 宿主 token，禁止任意全局 CSS import” |

### 3.2 后续风险与处置

| 编号 | 风险 | 后续版块 |
|---|---|---|
| R-01 | stdout/stderr 截断上限与 history 增长控制 | P3 |
| R-02 | 项目脚本执行的沙箱 / 授权细节 | P3 |
| R-03 | `mlPhase` 进入 `SessionProjectionStateMap` 的类型增强路径 | P5 / O19 |
| R-04 | 并发会话写冲突与节流作用域 | P2/P5；P0 已冻结为项目根作用域、不自动重试 |
| R-05 | 预步全量证据扫描的最坏延迟 | P3 设计约束 |
| R-06 | rc 宿主升级回归 | O20 |
| R-07 | `verify.cmd -Only` 的真实支持性 | P3 / O21 |

### 3.3 误报或不建议在 P0 修

| 编号 | 结论 |
|---|---|
| M-01 | “测试只验证常量”整体批评不成立；P0 测试职责就是冻结契约，问题是覆盖不足，已修 |
| M-02 | O11/O12/O17 的推迟裁决合理，P0 只需冻结边界 |
| M-03 | `SNAPSHOT_VERSION` 与 `PROJECTION_VERSION` 的冗余无害；已注明 `PROJECTION_VERSION` 为文档级记录 |
| M-04 | `phases.default.yml` 尚不存在属于 P2，不是 P0 缺陷 |
| M-05 | 未发现 P0 越界进入 P1；`package.json` 尚无 `main` / `exports` / `dsh.bundle` |

## 4. 第二轮复核

第二轮复核提示词：

```text
只读检查 P0 必须修项是否已闭合。重点核对：
- 无 state.json 时是否仍可能播种；
- 快照/投影是否有 phases 列表；
- 证据执行是否只有一个入口和一个粒度；
- zod 双 schema 是否明确；
- defer 与 advance 是否有解除和回退路径；
- 投影过期是否忽略时间戳；
- projectRoot 是否被限制为会话派生根；
- 契约测试是否覆盖关键不变量。
只输出：结论、仍存在的 P0 blocker、建议分类（必须修/后续风险/误报）。
不要修改文件。
```

第二轮结论：**通过**。

第二轮复核确认首轮 3.1 的 10 项全部闭合，未发现新的 P0 blocker。剩余事项仅为后续风险：`E_DEFERRED` 残留语义已修正、会话中途删除 `state.json` 的 stale 行为已冻结、Windows 路径规范化已冻结、`declared` 空字符串已归类为 `E_STATE_CORRUPT`。

完整第二轮输出：`docs/ADVERSARIAL-REVIEW.round2.raw.md`。

