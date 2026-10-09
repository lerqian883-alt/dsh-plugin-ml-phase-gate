# P6 实现逻辑：客户端可视化

> 状态：P6 实现逻辑文档。
> 目标：在 `conversation.input.dock` 中渲染机器学习阶段轨道，让用户在不读磁盘的情况下看到 evidence 游标、declared 游标、gap、defer 和下一阶段出口提示。
> 不包含：P7 右栏审计视图、实时推送与历史回放。

## 1. 设计边界

- 磁盘上的 `phases.yml` / `state.json` / 检查结果是唯一真相源。
- 客户端只消费 `useProjection('mlPhase')`，不得读盘、跑检查、重算 `evidenced` 或 `gap`。
- 客户端只做两件事：
  1. 把投影字段映射为阶段轨道视觉位置；
  2. 把投影字段渲染为可访问的 badge 与详情。
- `undefined` 表示投影能力尚未注册；`null` 表示已注册但没有项目状态；对象表示可用投影。
- 所有阶段数量、阶段 id 和显示名称来自投影 `phases`，不把 M0–M8 写死在 UI 逻辑中。

## 2. 文档与宿主检索记录

编码前核对了以下实现事实：

- `dsh-client-ui-slots`：`ctx.slots.register` 的 list 槽位必填 `id`，同 `(槽位, id, priority)` 冲突会 throw；`conversation.input.dock` 必须包在 `ctx.slots.inject` 中注册。
- `dsh-client-ui-conversation`：dock 席位为输入卡片上方的全宽增量槽；现有 todo=0、goal=10，P6 使用 order=5。
- `dsh-client-ui-goal/lib/client.js`：客户端 bundle 形状为 `window.__ModuleLoader__.load({id, factory})`；locale 通过 `ctx.effect(() => ctx.locale.register(...))` 注册；`useProjection` 由宿主作为组件 props 注入。
- `dsh-client-ui-primitives` 类型声明：`StateDot` 支持 `done/ongoing/error/idle`，`Tooltip` 支持 `label/side/portal/delayMs`，`Tag` 支持 `tone`。
- P0 `docs/CONTRACTS.md` §4：槽位、id、order、locale、三态和客户端只读边界。

## 3. 模块与数据流

```text
phases.yml + state.json
        │
        ▼
P5 evidence/evaluation
        │
        ▼
buildSnapshot(evaluation, phases)
        │  nextExit = 下一阶段出口摘要
        ▼
user/message source.kind=ml-phase-gate
        │
        ▼
mlPhase projection (stateSchema/viewSchema)
        │
        ▼
useProjection('mlPhase')
        │
        ▼
buildRailModel → StageRail → StateDot / Tag / Tooltip
```

客户端 bundle 只 `require('react')` 与 `@deepseek-ai/dsh-client-ui-primitives`。不引入 CSS Modules 构建依赖，也不导入全局 CSS。

## 4. 双游标模型

`buildRailModel(phase)` 保持纯函数：

- `evidencedIndex`：从 `phase.evidenced` 在 `phase.phases` 中查找。
- `declaredIndex`：直接使用投影 `phase.index`。
- `nextIndex`：从 `phase.next` 在 `phase.phases` 中查找。
- 每个节点输出：
  - `evidenced`：节点是否位于 evidence 游标及左侧。
  - `declared`：节点是否恰好是 declared 游标。
  - `gap`：仅在 evidence 游标存在时，标记 `(evidencedIndex, declaredIndex]`。
  - `next`：节点是否是基于 evidence 推导的下一阶段。
  - `state`：
    - gap → `error`
    - evidence 覆盖 → `done`
    - next → `ongoing`
    - 其他 → `idle`

`evidenced = null` 时 `evidencedIndex = -1`，不渲染 gap 红段，避免把“新项目尚未有证据”误画成“伪造证据”。

## 5. 组件结构

### `MlPhaseDock`

- 无 `useProjection` 能力：返回 `null`，不挂宿主组件。
- `phase === undefined`：返回 `null`。
- `phase === null`：渲染带 idle 状态点的“未开始”条。
- 对象：委托给 `StageRail`。

### `StageRail`

- 组装阶段节点和节点间连接线。
- 右侧显示当前 `phaseId`。
- 条件 badge：
  - `gap > 0` → danger `gap N`
  - `deferred` → warning `defer`
  - `next` → info `next <id>`
- 点击按钮切换 `open`，鼠标进入/离开切换 `hover`。
- `open || hover` 时渲染 `role="dialog"` 详情：
  - declared、evidence、gap、next
  - `nextExit.checks`
  - `nextExit.artifacts`
  - `nextExit.commonPitfalls`
  - defer 原因

### `StageNode`

- 每个节点带 `data-stage-index`、`data-phase-id`、`tabIndex=0` 和 `aria-label`。
- declared 节点用外围圆环标记；StateDot 表达证据/进行中/缺口/未开始。
- Tooltip 使用 `portal=true`，避免 dock 祖先的 overflow/clip 隐藏气泡。

## 6. 样式与契约修正

P6 是手写 bundle，无构建期 CSS Modules 管线。实现采用 React inline style，并按 `docs/CONTRACTS.md` 的 P6 契约修正执行：

- 不在 bundle 中 import 全局 CSS。
- 颜色、背景、边框、圆角、阴影和文字颜色优先使用宿主 token。
- 所有 `var(--...)` 均提供 fallback，避免变量缺失时整条 CSS 声明失效。
- 允许必要的布局/层级几何字面量，但真机验收必须走查主题、窄屏、裁剪和堆叠。

## 7. `nextExit` 与版本迁移

- `buildSnapshot` 在 P6 增加 `nextExit`：
  - 来源是 `evaluation.next` 对应阶段定义的 `exit` 和 `commonPitfalls`。
  - `next` 为空或阶段定义不存在时写 `null`。
  - 快照、指纹和投影 schema 都必须包含它。
- 版本：
  - `SNAPSHOT_VERSION = 2`
  - `PROJECTION_VERSION = 2`
  - projection `stateVersion = 2`
- `decodeSnapshot` 接受 v1 快照并规范化为 v2、`nextExit = null`；未知版本返回 `null`，保留旧投影。
- `parseState` / `parseView` 同样可将旧 v1 状态规范化为当前投影形状。

## 8. 注册逻辑

```js
exports.apply = (ctx) => {
  ctx.effect(() => ctx.locale.register('mlPhase', { zh, en }), 'ml-phase-gate:locale');
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register({
      name: 'conversation.input.dock',
      id: 'ml-phase',
      order: 5,
      locale: 'mlPhase',
    }, MlPhaseDock)
  );
};
exports.inject = ['slots', 'locale'];
```

- locale 字典与注册形状由测试锁定。
- 槽位通过 `inject` 延迟到 `conversation.content` 声明之后。
- 不注册 `children`，不抢占已有 id。

## 9. 测试策略

`test/p6-client.test.mjs` 使用 `node:vm` 和 fake `window.__ModuleLoader__` 加载真实 bundle：

- manifest 暴露 web client bundle、槽位和 primitives 依赖。
- `buildRailModel` 覆盖双游标、gap、next 和 null。
- `MlPhaseDock` 三态：能力缺失/undefined、null、对象。
- `StageRail` 覆盖 gap/defer/next badge。
- open 状态覆盖 `role="dialog"`、`aria-expanded=true` 和 nextExit 文本。
- closed 状态覆盖无详情、按钮和 hover handler 的状态 setter 接线。
- bundle 文本覆盖槽位和 `data-stage-*` 标记。

## 10. P6 完成定义

- P0–P6 全量测试通过。
- P6 的样式偏离和 `nextExit` 已写入契约修正。
- README 与 P6 文档同步。
- Claude Code 第二轮复核确认四个 P6 必修项闭合。
- 真实插件目录同步后 `dsh --profile web --dump-config` 能看到客户端半。