# ML Phase Gate 实现逻辑文档（P0）

> 本文是 P0 的实现逻辑文档。
> 规则：写代码前先检索文档和宿主实现；遇到问题先复现、检索、记录，再修改代码。
> 本文不替代最终代码注释，但必须解释代码的存在理由、边界和不变量。

## 1. 实现总原则

### 1.1 先契约，后实现

P0 只冻结契约，不实现功能。后续每个版块必须：

1. 读取本目录下的 `docs/CONTRACTS.md`。
2. 读取适用的宿主类型和先例代码。
3. 写出该版块的实现逻辑。
4. 再写代码。
5. 运行对应验收。

### 1.2 纯函数优先

尽量把业务逻辑放进纯函数：

```text
纯函数：
  evaluatePhase()
  buildSnapshot()
  decodeSnapshot()
  renderPrompt()

副作用：
  读文件
  写状态
  跑检查
  注册工具
  注册投影
  注册槽位
  追加会话事件
```

纯函数区不依赖 DSH 运行时，便于单元测试。

### 1.3 真相与镜像分离

- 磁盘 `state.json` 是项目真相。
- 会话 `mlPhase` 是当前会话镜像。
- 客户端 Dock 是镜像的视图。

禁止：

- 在 `init` 中读磁盘。
- 在 projection `apply` 中跑检查。
- 在客户端重新计算 `evidenced`。
- 把 `evidenced` 写进 `state.json`。

## 2. 问题处理协议

遇到问题时按以下顺序执行：

1. **复现**：写出最小复现或 fixture。
2. **检索**：先读本地文档和宿主类型。
3. **定位**：确认问题属于契约、宿主 API、项目文件还是实现 bug。
4. **记录**：在实现逻辑或评审记录中写下证据路径和结论。
5. **修复**：做最小修改。
6. **回归**：运行对应验收和相邻验收。
7. **留痕**：记录未解决边界。

禁止：

- 先猜 API。
- 先改代码再看文档。
- 为了让测试变绿而删除判据。
- 把权限、审批、安装、发布混为一个步骤。

## 3. 文档优先协议

### 3.1 检索顺序

写任何代码前，按以下顺序检索：

1. `<dsh-workspace>\AGENTS.md`
2. 本插件目录中的 `DESIGN.md`、`CONSTRUCTION.md`、`BUILD-PLAN.md`
3. 本目录的 `docs/ARCHITECTURE.md`、`docs/CONTRACTS.md`
4. 已安装 DSH 的类型声明和 README：

```text
<user-home>\AppData\Roaming
pm
ode_modules\@deepseek-ai\dsh
ode_modules\@deepseek-ai\
```

5. 同类官方插件的实现先例：

```text
dsh-time-context
dsh-tool-todo
dsh-client-ui-goal
dsh-client-ui-conversation
dsh-client-ui-slots
dsh-session-projection
```

6. 最后才写代码。

### 3.2 证据优先级

发生冲突时：

```text
已安装宿主类型/源码 > 宿主 README > 本插件设计稿 > 散文约定
```

记录冲突时至少写下：

- 冲突双方路径。
- 冲突内容摘要。
- 采纳哪一方。
- 采纳理由。
- 后续验证方式。

### 3.3 检索记录格式

```text
[检索记录]
问题：
检索路径：
关键证据：
结论：
影响代码：
验证方式：
```

没有检索记录的 API 级改动，不允许进入实现。

## 4. P0 代码实现说明

### 4.1 `lib/contracts.js`

职责：

- 导出冻结常量。
- 导出 JSDoc 类型。
- 不读文件、不注册服务、不依赖 DSH。

实现逻辑：

1. 常量集中声明。
2. 嵌套对象使用 `Object.freeze`。
3. 默认配置中的数组也冻结。
4. 所有模块 import 此文件，而不是复制字符串。
5. 任何新增常量都必须同步 `docs/CONTRACTS.md` 和 `lib/types/contracts.d.ts`。

不变量：

- `PLUGIN_NAME === SNAPSHOT_SOURCE_KIND`。
- `PROJECTION_KEY === 'mlPhase'`。
- `DOCK_SLOT === 'conversation.input.dock'`。
- `DOCK_ID === 'ml-phase'`。
- `DOCK_ORDER === 5`。
- `PHASE_IDS` 默认覆盖 M0–M8。
- `CHECK_EXIT` 固定为 0/1/2。

### 4.2 `lib/types/contracts.d.ts`

职责：

- 为后续 TypeScript/JS 代码提供共享类型。
- 与实际运行时常量保持一致。
- 不产生运行时代码。

实现逻辑：

1. 常量声明使用字面量类型。
2. 数据结构使用 `interface`。
3. `CheckStatus` 使用联合类型。
4. `PhaseId` 当前使用 `string`，默认阶段集由 `PHASE_IDS` 表达。
5. 任何字段改动先改本文件，再改运行时契约和文档。

### 4.3 `test/p0-contracts.test.mjs`

职责：

- 验证运行时常量没有被意外修改。
- 验证嵌套对象已冻结。
- 验证 P0 文档存在并包含必需章节。
- 为后续契约变更提供回归保护。

实现逻辑：

1. 导入 `lib/contracts.js`。
2. 逐项断言关键常量。
3. 断言嵌套对象冻结。
4. 检查 P0 五份文档存在。
5. 检查文档必需章节标题存在。

不变量：

- 测试不依赖 DSH 运行时。
- 测试不写文件。
- 测试可以在没有安装插件的情况下运行。
- 测试失败时必须指出契约漂移。

## 5. 后续版块实现逻辑摘要

### 5.1 P1 插件骨架

实现逻辑：

- `package.json` 从 P0 元数据扩展。
- 增加 `main`、`exports`、`dsh.bundle.patch`。
- `cordis.patch.yml` 只插入插件行。
- `lib/index.js` 只负责装配，不放业务判断。
- 安装和卸载必须可逆。

### 5.2 P2 阶段与状态

实现逻辑：

- `phases` 加载器先读默认，再读项目覆盖。
- `state` store 只读写声明、历史和 defer。
- 项目根解析从 `SessionHeader.cwd` 向上查找 marker。
- 写入必须原子化并按项目加锁。

### 5.3 P3 证据

实现逻辑：

- 检查执行器调用项目自己的 `work/verify.cmd -Only <prefix>`；一个前缀产生一个 `CheckResult`。
- 检查结果统一为 `CheckResult`。
- 超时、错误、skip 都必须显式记录。
- 每条新检查必须有变异测试。

### 5.4 P4 判定与工具

实现逻辑：

- 判定引擎是纯函数。
- `advance` 在检查失败时不写盘。
- 前向推进只允许 `to === next`；跳阶段报 `E_INVALID_TRANSITION`。
- 回退必须带 `reason`，且不删除历史。
- `defer` 必须带 reason；`clear: true` 可清除 defer，成功 advance 自动清除 defer。
- 工具输出 schema 必须可被 UI 消费。

### 5.5 P5 注入与投影

实现逻辑：

- `agent/pre-step` 读取磁盘、计算 evaluation、构造 snapshot。
- 仅当 `state.json` 存在且 `declared` 非空时播种。
- 使用忽略 `updatedAt` / `checkedAt` 的 fingerprint 判断投影过期。
- 快照和投影都携带 `phases: PhaseView[]`，支持项目自定义阶段。
- 使用 `user/message` + `source.kind` 作为桥。
- 投影 `init` 返回 `null`，并提供与 `MlPhaseProjection | null` 一致的 `stateSchema` 和 `viewSchema`。
- 投影 `apply` 只处理本插件 source。
- 不关心的事件返回同一个状态引用。

### 5.6 P6 客户端 UI

实现逻辑：

- 客户端只读 `useProjection('mlPhase')`。
- 使用 `ctx.slots.inject` 注册 `conversation.input.dock`。
- 三态渲染：`undefined` 静默、`null` 未开始、对象正常。
- 样式必须经平台 CSS Modules 管线并只使用宿主 token；禁止任意全局 CSS import。
- 不 import 非平台种子模块。

## 6. 测试策略

| 层级 | 方式 |
|---|---|
| 契约 | Node 内置测试，不依赖 DSH |
| 判定 | fixture 输入输出 |
| 证据 | 变异测试 + 阳性对照 |
| 工具 | fixture 项目上的集成测试 |
| 投影 | fold 事件序列测试 |
| UI | 槽注册测试 + 三态渲染测试 |
| 安装 | 真实 profile 安装/卸载 smoke |

每条验收必须能给出：

- 命令。
- 期望结果。
- 实际结果。
- 失败时的下一步。

## 7. P0 完成定义

P0 完成必须满足：

1. 总体架构文档存在。
2. 契约冻结文档存在。
3. 实现逻辑文档存在。
4. 运行时契约文件存在且可解析。
5. 类型声明存在。
6. 契约测试通过。
7. Claude Code 对抗评审已完成并记录。
8. P0 验收文档记录了命令和结果。



