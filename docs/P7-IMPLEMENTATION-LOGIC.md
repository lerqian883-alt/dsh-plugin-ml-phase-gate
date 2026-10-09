# P7 实现逻辑：审计、实时与硬化

> 状态：P7 实现逻辑文档。
> 目标：在 P6 dock 之外增加可审计信息面，并把“状态变化如何到达 UI”从单一 pre-step 扩展为明确的实时与历史策略。
> 本文件先冻结拆分边界；P7.1 已实现，P7.2/P7.3 需要独立实现和证据门。

## 1. P7 拆分

| 子阶段 | 目标 | 不变量 |
|---|---|---|
| P7.1 右栏审计页 | 在 `sidebar.right.pane.tab` 展示完整阶段清单、游标、gap、defer、nextExit | 继续只读 `mlPhase` 投影，不读盘、不跑检查 |
| P7.2 实时刷新与历史回放 | 监听磁盘状态变化，把新 snapshot 推入会话；提供可见的更新/审计时序 | 磁盘是真相源；投影仍是会话事件 fold |
| P7.3 视觉与可访问性硬化 | 窄屏、暗色/密度主题、键盘焦点、Esc、pane 裁切、错误状态 | 不改变 P6/P7 投影 wire shape |

P7.1 可以独立交付；P7.2/P7.3 不阻塞 P7.1，但最终 P7 退出必须三者都有证据。

## 2. 文档与宿主检索记录

编码前核对：

- `dsh-client-ui-sidebar-right/README.zh.md`：tab 类型先在 `ctx.sidebarRightTabs.register` 注册静态定义，再在 `sidebar.right.pane.tab` keyed seat 注册正文。
- `lib/types/client/contract/slots.d.ts`：`sidebar.right.pane.tab` 的 key 是 tab 定义 `id`，正文通过 `useTabInfo()` 读取 pane、tab、navigation、actions 和 signal。
- `lib/types/client/tab-registry.d.ts`：`id` 是插件实现身份；`kind` 是用户打开的页类型；`priority: 'extension' | 'builtin' | 'fallback'`。
- `lib/types/client/service.d.ts`：`ctx.sidebarRight.openTab(kind, options?)` 是打开页的公共入口，未挂载会话时 fail loud。
- `dsh-client-ui-sidebar-terminal/lib/client.js`：两阶段注册、locale、guide、body seat 的官方包内先例。
- P6 `docs/CONTRACTS.md`：客户端只读投影，`undefined` / `null` / 对象三态。

## 3. P7.1 数据和职责

P7.1 不新增 snapshot 字段，不改变 projection schema。审计页直接消费 P6 已有的：

```text
mlPhase
  version
  phaseId
  index
  phases[]
  evidenced
  gap
  next
  deferred
  deferReason
  nextExit
  updatedAt
```

职责边界：

- Dock：常驻摘要和打开审计页的入口。
- Audit tab：更大的阶段清单和 nextExit/defer 明细。
- Host/pre-step：继续负责计算 evidence、gap、next 和 snapshot。
- Browser：只做显示和导航，不读 `state.json`。

## 4. P7.1 tab 注册

定义身份：

```js
const AUDIT_TAB_ID = 'dsh-plugin-ml-phase-gate/audit';
const AUDIT_TAB_KIND = 'ml-phase-audit';
```

类型注册：

```js
ctx.sidebarRightTabs.register({
  id: AUDIT_TAB_ID,
  kind: AUDIT_TAB_KIND,
  priority: 'extension',
  title: () => t('audit.title'),
  guide: [{ id: 'open', order: 30, title, description }],
});
```

正文注册：

```js
ctx.slots.inject('sidebar.right.pane.tab', () =>
  ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: AUDIT_TAB_ID,
    locale: 'mlPhase',
  }, MlPhaseAudit)
);
```

打开路径：

```js
ctx.sidebarRight.openTab(AUDIT_TAB_KIND)
```

由 `conversation.input.dock` 的 injection 提供 `openAudit` 回调；服务未挂载或 sidebarRight 缺席时，Dock 不显示入口。

## 5. P7.1 组件

### `MlPhaseAudit`

- `useProjection === undefined`：返回 null，不渲染错误 UI。
- `mlPhase === null`：渲染 empty state。
- 对象：
  - Summary：declared、evidence、gap、next、defer、updatedAt。
  - Phase rows：按投影 `phases` 顺序渲染每组 `StateDot + id + name + Tag`。
  - Next exit：checks、artifacts、commonPitfalls。
  - Defer：原因和状态。

### `StageRail` 扩展

- 保持 P6 双游标和 popover。
- 新增可选的 `openAudit` 按钮。
- 没有 `openAudit` 时不渲染按钮，保持 P6 兼容。

## 6. P7.2 实时刷新候选实现

实时刷新需要独立评审，当前不提前实现。候选逻辑：

1. `agent/pre-step` 已有一轮计算，可作为冷启动基线。
2. 在会话首次 pre-step 成功后，记录 session 和项目根。
3. 使用 `ctx.fs.resolve` + `ctx.fs.watch` 监听 `state.json` / `phases.yml`。
4. 文件变化后重新执行 `computeAgentSnapshot`。
5. fingerprint 变化时，向该会话追加完整 `user/message` snapshot。
6. watcher 必须在 session 生命周期或插件卸载时关闭。
7. 不把 watcher 放在客户端；浏览器没有项目文件权限。

P7.2 必须处理：

- session 与 project root 的多对多关系；
- watcher 重试和删除文件；
- 写入事件抖动；
- 不重复注入 fingerprint；
- 不在事件回调中阻塞或抛未捕获异常；
- session 结束后释放 watcher。

## 7. P7.2 历史回放候选

历史回放不应伪造磁盘历史。可从两个只读来源组合：

- `state.json.history`：项目声明的迁移审计记录。
- 会话日志中的 `source.kind === 'ml-phase-gate'` snapshot 序列：当前会话看到的相位变化。

UI 只显示已有记录，不把 projection 变化反写成项目历史。

## 8. P7.3 硬化清单

- 窄屏时轨道改为横向滚动、折行或分段，不裁掉 M0/M1。
- 暗色、密度、Windows 标题栏和窄右栏。
- Audit tab 的空态、错误态和长文本溢出。
- popover：Esc 关闭、焦点返回、`aria-label`、工具提示。
- Audit rows：键盘可聚焦、语义列表和可读状态。
- 所有 CSS token 继续带 fallback。

## 9. P7.1 测试策略

- manifest 声明 `@deepseek-ai/dsh-client-ui-sidebar-right`。
- `MlPhaseAudit` null 态。
- `MlPhaseAudit` summary、phase rows、nextExit、defer 文本。
- `apply` 注册 audit tab type。
- `apply` 注册 `sidebar.right.pane.tab` body。
- Dock injection 的 `openAudit` 调用 `sidebarRight.openTab('ml-phase-audit')`。
- P6 全套测试保持通过。

## 10. P7.1 完成定义

- P0–P7.1 全量测试通过。
- 右栏 audit tab 在真实 DSH web 中可打开并显示投影。
- Dock 的审计入口可用；sidebar 服务缺席时安全降级。
- P7.2/P7.3 的未实现部分在 README 和验收文档中明确，不声称完成。
## 11. P7.3.1 已实现硬化

- 阶段轨道改为横轴可滚动，不再用 `overflow:hidden` 静默裁掉 M0/M1。
- 轨道保留最小可用宽度。
- popover 在 Escape 后同时清除 `open` 和 `hover`，并将焦点返回触发按钮。
- popover 增加 `aria-label` 和 viewport 宽度上限。
- audit 页使用 region/list/listitem 语义，阶段行可聚焦并带行级 aria-label。
- 真实宿主窄视口验证：`overflowX=auto`、`clientWidth=120`、`scrollWidth=569`、Escape 关闭成功、焦点返回成功。

未实现：暗色/密度主题深度验收、关闭/重开、分栏/浮窗、完整焦点陷阱。

## 12. P7.2.1 watcher / stale / 显式刷新

已实现：

- `lib/inject/watch.js`：监听 `projectStateFile` 和 `projectPhasesFile`，debounce 后只失效缓存并追加 stale snapshot message。
- `lib/inject/suppress.js`：工具/status/fresh pre-step 提交后建立短暂 suppression，避免自写入被误标 stale。
- snapshot/projection v4 增加 `stale` / `staleAt` / `history`；fingerprint 包含 stale/history，忽略 staleAt。
- `ml_phase_status` 成功后通过 `deferContext` 发送 fresh v4 snapshot，并对相同 fingerprint 去重。
- Dock/audit 在 stale 时显示“数据可能过期”。

安全边界：

- watcher **不运行** `work/verify.cmd` 或任何 `work/checks` 脚本。
- 真实探测依然由 agent/pre-step 或显式 `ml_phase_status` 触发。
- opt-in 自动检查、多 session watcher 去重和 artifact watcher 仍未实现。

真实宿主验证：

- 外部改写 `state.json` 后，无新模型消息，Dock 自动出现“数据可能过期”；
- 原 evidence/gap/next 保留，仅增加 stale 标记；
- 本地 watcher/stale/status 测试 7/7 通过；全量 124/124 通过。

## 13. P7.2.2 历史回放

已实现：

- snapshot v4 增加 `history` 视图。
- `computeAgentSnapshot` 从 `state.history` 投影 `from/to/at/reason/deferReason/evidence` 摘要。
- `ml_phase_status` 显式刷新同样携带 history。
- audit 页渲染“历史回迁”列表，最新记录置顶。
- 历史和 evidence 数量分别限制为最近 50 条，避免投影无界增长。
- v1/v2/v3 迁移到 v4 时 history 默认为空；v2/v3 nextExit 保留。

历史回放仍然只是只读视图，不反写 `state.json`，也不从 projection 推导新的项目历史。

## 14. P7.2.3 committed snapshot 去重

新增 `lib/inject/committed.js`，记录每个 session 最近一次真正提交到投影流的 snapshot：

- pre-step 注入 fresh snapshot 后写入 committed。
- watcher 写入 stale snapshot 后更新 committed。
- `deferSnapshotContext` 在发送前比较 fingerprint：
  - 相同：只失效缓存并建立 suppression，不重复发送 user/message；
  - 不同：发送 fresh snapshot 并更新 committed。

因此连续调用 `ml_phase_status` 不会向会话重复注入相同内容，但每次调用仍会按显式请求执行检查。

## 15. P7.2.4 项目级 watcher 优化

- 项目根维度共享 watcher，同 root 多 session 不重复监听。
- 目标包括 state、phases 和所有 phase `exit.artifacts`。
- session 生命周期移除按引用处理。
- `watchAutoRun` 默认 false；显式开启后每项目根只 probe 一次，向所有相关 session 提交 fresh snapshot。
- 自动 probe 仍复用显式检查路径，失败时保留 stale。

## 12. P7.3.2 焦点与键盘硬化

已完成：

- popover 打开时聚焦 `role="dialog"` 容器。
- Tab 在非模态详情中保持在 dialog 上，避免焦点逃回被遮挡页面。
- Escape 关闭后焦点返回“展开阶段详情”。
- audit 阶段行支持 ArrowUp / ArrowDown / Home / End 循环聚焦。
- 行保持 `role="listitem"`、`tabIndex=0` 和行级 aria-label。

自动测试覆盖 `tabIndex=-1`、Escape、行导航 handler；真实宿主还需要关闭/重开、分栏/浮窗和主题走查。

## 16. P7.3.3 对抗复核修正：watcher 冷启动并发

宿主文档核对结果（`@deepseek-ai/dsh-fs`）：

- `fs.watch(target, changed, signal)` 可观察文件或目录，target 可以是尚不存在的路径，用于等待创建。
- signal 只取消 watcher 初始化；初始化成功后，调用方必须执行并等待返回的 close 函数。
- `changed` 回调可在初始化期间或初始化之后报告错误。

实现复核发现：`ensureSessionWatch` 在项目 watcher 建立期间会把“尚未完成的 closers 数量”误判为不完整 watcher。两个 session 同时首次进入同一项目根时，后一次调用可能关闭前一次的初始化并删除新项目，导致两者都注册失败。

修正策略：

1. 项目记录新增 `ready` Promise，同一签名下的并发调用等待同一个初始化结果。
2. 项目初始化期间不再按 `closers.length` 判断并重建项目；只有签名变化、项目关闭或会话释放才关闭旧项目。
3. 初始化失败清理项目时使用引用一致性检查，避免删除已被后续签名替换的新项目。
4. probe 完成前 session 可能已释放；提交前重新检查项目仍持有该 session，避免向已 disposed session 追加快照。
5. 增加并发注册、共享 project 的分步释放、probe 期间释放 session 的测试。

## 17. P7.3.3 三轮评审后的最终修正

- watcher `ready` 设置 5 秒超时；超时 abort、关闭并删除 pending 项目。
- `setupProject` 错误在 ready Promise 中兜底，避免 unhandled rejection。
- `session/disposed` disposer 使用 sentinel；`disposeAllWatches` 始终清理 sentinel。
- root 切换先建立新 watcher，成功后才移动 session 映射。
- pre-step 同时使用 current projection 和 committed fingerprint 去重。
- StageRail Tab containment 仅在焦点位于 dialog 子树时生效；全局 Tab 不再被劫持。
- 最终本地全量 135/135；P7.2 watcher 专项 13/13。
- Claude Code 第二轮只读复核确认 H1/H2/H3 与 M2/M3 全部 Resolved，无剩余 Blocker/High。

