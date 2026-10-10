# P0 总体设计与契约冻结验收

> P0 范围：只冻结架构、契约、实现逻辑和最小契约测试。
> 不包含：插件加载、阶段解析、证据执行、工具面、投影、客户端 UI。

## 1. P0 任务清单

| 编号 | 任务 | 交付物 | 状态 |
|---|---|---|---|
| T0.1 | 冻结插件名称、包名、版本、运行基准 | `docs/CONTRACTS.md`、`lib/contracts.js` | 完成 |
| T0.2 | 冻结核心数据对象 | `docs/CONTRACTS.md`、`lib/types/contracts.d.ts` | 完成 |
| T0.3 | 冻结插件配置结构 | `docs/CONTRACTS.md`、`lib/contracts.js` | 完成 |
| T0.4 | 冻结错误码 | `docs/CONTRACTS.md`、`lib/contracts.js` | 完成 |
| T0.5 | 冻结主机半与客户端半边界 | `docs/ARCHITECTURE.md`、`docs/CONTRACTS.md` | 完成 |
| T0.6 | 完成 Claude Code 对抗评审与处置 | `docs/ADVERSARIAL-REVIEW.md` | 完成 |

## 2. 交付物清单

| 文件 | 作用 |
|---|---|
| `docs/ARCHITECTURE.md` | 总体架构与边界 |
| `docs/CONTRACTS.md` | 数据、工具、投影、UI 契约 |
| `docs/IMPLEMENTATION-LOGIC.md` | 文档优先协议和实现逻辑 |
| `docs/ADVERSARIAL-REVIEW.md` | Claude Code 对抗评审记录 |
| `docs/P0-ACCEPTANCE.md` | 本验收文档 |
| `lib/contracts.js` | 运行时冻结常量 |
| `lib/types/contracts.d.ts` | TypeScript 契约 |
| `test/p0-contracts.test.mjs` | P0 契约回归测试 |
| `package.json` | P0 包身份和测试入口 |

## 3. 验收记录

### 3.1 契约测试

命令：

```powershell
node --test test/p0-contracts.test.mjs
```

说明：

- 常规 `node --test` 在当前沙箱中会因隔离子进程触发 `spawn EPERM`。
- `` 运行同一批断言并提供有效结果。
- 测试不依赖 DSH 运行时。

实际结果：

```text
tests 10
pass 10
fail 0
```

### 3.2 语法检查

命令：

```powershell
node --check lib/contracts.js
node --check test/p0-contracts.test.mjs
```

实际结果：

```text
通过，无语法错误
```

### 3.3 文档一致性检查

检查项：

- `docs/ARCHITECTURE.md` 存在 `## 1. 目标与非目标`。
- `docs/CONTRACTS.md` 存在 `## 2. 数据契约`。
- `docs/IMPLEMENTATION-LOGIC.md` 存在 `## 3. 文档优先协议`。
- `docs/P0-ACCEPTANCE.md` 存在 `## 3. 验收记录`。
- `docs/ADVERSARIAL-REVIEW.md` 存在 `## 3. 评审发现与处置`。

实际结果：

```text
通过，由 test/p0-contracts.test.mjs 的文档存在性断言覆盖
```

### 3.4 Claude Code 对抗评审

评审工具：

```text
Claude Code CLI 2.1.289
```

评审方式：

- 只读评审。
- 尝试证伪 P0 契约。
- 对照本机 DSH 安装类型和先例实现。
- 评审记录见 `docs/ADVERSARIAL-REVIEW.md`。

实际结果：

```text
首轮结论：有条件通过。
所有 P0 必须修项已进入处置表并完成最小修复。
第二轮结论：通过，无 P0 blocker。
```

## 4. 未决问题

| 编号 | 问题 | 当前裁决 | 后续处理 |
|---|---|---|---|
| O11 | `createUserMessage` 的来源 | P0 冻结 bridge 形状，不冻结 import 方式 | P5 实现前检索 `dsh-time-context` 与 `dsh-llm`，并做安装 smoke test |
| O12 | `zod` 可能在 profile 中出现第二份副本 | P0 要求提供 `stateSchema` 和 `viewSchema` | P5 实现前验证投影注册兼容性 |
| O17 | 客户端 `dsh.client.inject` 精确依赖边 | P0 冻结 UI 槽位，不冻结启动相位 | P6 实现前检索 `dsh-client-modules` 与 `dsh-client-ui-goal` |
| O18 | `contracts.js` 是否需要发布为子路径 | P0 只冻结文件位置 | P1 决定 `exports` 形状 |
| O19 | `mlPhase` 如何进入宿主投影类型表 | 需要 `declare module` 增强或等价方案 | P5 实现前检索 `SessionProjectionStateMap` 并做编译验证 |
| O20 | rc 宿主升级回归 | 当前基准为 `0.1.7-rc.2` | 每次宿主升级重跑 P0 宿主核验清单 |
| O21 | `verify.cmd -Only` 支持性 | P0 已冻结执行接口 | P3 必须在真实项目验证 `verify.cmd` 支持 `-Only` |
| O22 | 会话中途删除 `state.json` | P0 冻结为保留最后投影并允许 P5 显示 stale 警告 | P5 实现可选 stale 提示 |
| O23 | Windows 路径规范化 | P0 冻结为 realpath + 统一大小写/分隔符/尾斜杠 | P4 实现比较器时落实 |

## 5. P0 退出条件

- 所有交付物存在。
- 契约测试通过。
- 文档标题和版本一致。
- Claude Code 对抗评审完成，P0 必须修项闭合。
- 未决问题有明确后续处理版块。
- 未进入 P1 实现。

## 6. Post-review 处置摘要

| 评审发现 | 处置 |
|---|---|
| 快照空态不可表达 | 冻结：无 `state.json` 不播种，投影保持 `null` |
| 投影缺阶段序列 | `MlPhaseSnapshot` 和 `MlPhaseProjection` 增加 `phases: PhaseView[]` |
| 证据执行接口矛盾 | 冻结：每个前缀调用一次 `work/verify.cmd -Only <prefix>` |
| 缺 zod 双 schema | 契约要求 `stateSchema` 和 `viewSchema` 均可空 |
| defer 语义不闭合 | 定义 `clear`、`by`、scope、与 advance 的关系 |
| advance 迁移未定义 | 前向只允许 `next`；回退必须带 reason |
| 投影过期谓词未定义 | 使用忽略时间戳的 fingerprint |
| projectRoot 任意路径风险 | 只允许当前会话派生根，新增 `E_PROJECT_ROOT_FORBIDDEN` |
| 测试覆盖不足 | 扩展为 10 项，覆盖错误码全集、工具名、默认配置和联动不变量 |
| CSS 规则冲突 | 改为平台 CSS Modules + 宿主 token，禁止任意全局 CSS import |


