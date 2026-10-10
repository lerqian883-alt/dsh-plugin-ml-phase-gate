# P7.1 右栏审计页验收

> P7.1 范围：`sidebar.right.pane.tab` audit tab、阶段清单、summary、nextExit/defer 明细，以及 Dock 审计入口。
> 不包含：P7.2 实时刷新/历史回放、P7.3 视觉与 a11y 硬化。

## 1. P7.1 任务清单

| 编号 | 任务 | 交付物 | 状态 |
|---|---|---|---|
| P7.1.1 | 注册右栏 tab 类型 | `lib/client.js` | 完成 |
| P7.1.2 | 注册 `sidebar.right.pane.tab` 正文 | `lib/client.js` | 完成 |
| P7.1.3 | 实现 summary 与阶段清单 | `MlPhaseAudit` | 完成 |
| P7.1.4 | 实现 nextExit/defer 明细 | `MlPhaseAudit` | 完成 |
| P7.1.5 | Dock 审计入口 | `StageRail.openAudit` | 完成 |
| P7.1.6 | 增加右栏依赖与测试 | `package.json`、`test/p7-audit.test.mjs` | 完成 |
| P7.1.7 | 真实宿主视觉门 | 浏览器 audit tab | 完成 |

## 2. 本地验收

命令：

```powershell
node --test test\p0-contracts.test.mjs test\p1-skeleton.test.mjs test\p2-yaml.test.mjs test\p2-phases.test.mjs test\p2-project-root.test.mjs test\p2-state.test.mjs test\p3-evidence.test.mjs test\p4-tools.test.mjs test\p5-projection.test.mjs test\p6-client.test.mjs test\p7-audit.test.mjs test\p7-realtime.test.mjs
```

结果：

```text
tests 135
pass 135
fail 0
```

P7.1 专项：

```text
test/p7-audit.test.mjs
tests 8
pass 8
fail 0
```

覆盖：

- manifest 声明 `@deepseek-ai/dsh-client-ui-sidebar-right`。
- audit null 空态。
- summary、阶段行、nextExit、defer 文本。
- `sidebarRightTabs.register` 的类型定义。
- `sidebar.right.pane.tab` 的正文注册。
- Dock injection 的 `openAudit` 调用 `openAudit(KIND)`。

## 3. 实现裁决

1. audit tab 是只读投影消费者，不读盘、不跑检查。
2. tab 通过 `sidebarRightTabs.register` 注册静态定义，正文通过 `sidebar.right.pane.tab` keyed seat 注册。
3. Dock 只在 `sidebarRight` 和 `sidebarRightTabs` 可用时显示审计入口。
4. `openAudit` 只在已挂载 session 上调用；无 mounted session 时安全返回。
5. 右栏 tab 不改变 P6 的 `conversation.input.dock` 语义。

## 4. 真实宿主门

已完成主路径视觉门，详细证据见 §6；P7.3 边界已在 §14 完成：关闭/重新打开 audit tab、分栏/浮窗、窄屏、暗色主题与 Esc/焦点行为。

## 5. 边界

- P7.1 不实现 watcher。
- P7.1 不展示 `state.json.history` 的历史回放。
- P7.1 不实现 Esc/焦点完整管理；该项在 P7.3。
- 当前 audit 页使用与 P6 相同的 inline style + token fallback 契约修正。
## 6. P7.1.7 真实宿主视觉门

首次真实宿主点击“打开审计”时发现 `locale.bind` 丢失 `this`，tab 类型求值抛错，audit tab 未打开。修复后重新验证：

- Dock“打开审计”按钮可见。
- 点击后右栏出现 `ML 阶段审计` tab。
- Summary：声明 M2、证据 M1、差距 1、下一步 M2、人工覆盖 `visual gate: known issue`、更新时间。
- Next exit：检查 012、工件 `outputs/m2.json`、常见坑 `数据泄漏; 指标漂移`。
- Phase list：M0/M1 已完成、M2 证据缺口、M3–M8 未开始。
- 浏览器 console 相关错误为空。
- 截图：`<workspace>\ml-phase-visual-fixture\p7-audit-panel.png`。

该视觉门证明了 `sidebarRightTabs.register`、`sidebar.right.pane.tab`、Dock `inject`、`useProjection`、locale tab title 和审计渲染在真实宿主中可工作。

## 7. P7.3.1 硬化验收

已完成客户端硬化：

- 阶段轨道由 `overflow:hidden` 改为 `overflow-x:auto` 的可滚动轨道。
- 轨道设置 `min-width:120px`，避免窄容器里被压缩到不可用宽度。
- popover 宽度改为 `min(560px, calc(100vw - 32px))`，并增加 `maxWidth`。
- popover `role="dialog"` 增加 `aria-label="阶段详情"`。
- Escape 关闭 popover，并把焦点返回“展开阶段详情”按钮。
- audit 根节点增加 `role="region"`，阶段清单使用 `role="list"` / `role="listitem"`，行可聚焦并带 `aria-label`。

真实宿主验证（窄视口）：

- `overflowX = "auto"`
- `clientWidth = 120`
- `scrollWidth = 569`
- 轨道真实可滚动
- Escape 后 `aria-expanded="false"`
- 焦点返回 `展开阶段详情`

P7.3 已覆盖：暗色主题、关闭/重开、分栏/浮窗、桌面键盘焦点和窄右栏；Host 的右栏两格上限属宿主约束。

## 8. P7.2.1 watcher / stale / 显式刷新验收

范围：

- watcher 监听 `state.json` 和 `phases.yml` 变化；
- 只失效缓存和标记 stale，不自动执行 `verify.cmd`；
- `ml_phase_status` 成功后发送 fresh v4 snapshot；
- Dock 和 audit 页显示“数据可能过期”。

本地测试：

```text
test/p7-realtime.test.mjs
tests 13
pass 13
fail 0
```

真实宿主验证：

- 真实 session 首次 pre-step 后注册 watcher；
- 外部改写 `state.json` 后，无需新模型消息，Dock 显示“数据可能过期”；
- 原 evidence/gap/next 信息保留，仅增加 stale 标记；
- 截图：`<workspace>\ml-phase-visual-fixture\p7.2-stale.png`。

后续已完成：多 session watcher 去重、artifact watcher、opt-in 自动检查；最终见 §11 和 §13。

## 9. P7.2.2 history 投影验收

已完成：

- snapshot v4 增加 `history: HistoryEntryView[]`。
- `computeAgentSnapshot` 和 `ml_phase_status` 都把 `state.history` 投影为审计可见的摘要。
- 每条 history 只保留 `from/to/at/reason/deferReason` 和 check 摘要，最多保留最近 50 条、每条最近 50 个 evidence。
- audit 页新增“历史回迁”列表。
- v1/v2/v3 快照迁移到 v4 时默认 `history=[]`；v2/v3 的 `nextExit` 保留。

测试：

- `test/p7-audit.test.mjs`：history 行渲染。
- `test/p7-realtime.test.mjs`：state history 投影和 v2→v4 迁移。
- 该阶段回归 124/124 通过；最终全量 135/135。

## 10. P7.2.3 status fingerprint 去重验收

- `ml_phase_status` 第一次调用发送 fresh v4 snapshot。
- 相同 fingerprint 的第二次调用不再追加重复 `user/message`。
- committed snapshot 在 pre-step、watcher stale 和 deferSnapshotContext 三条路径保持一致。
- 该阶段 P7.2 专项 7/7、全量 124/124；最终专项 13/13、全量 135/135。

## 11. P7.2.4 watcher 优化验收

已完成：

- 同一项目根的多个 session 共享一组 watcher。
- session/disposed 只移除对应 session，最后一个 session 退出时关闭项目 watcher。
- 监听 `state.json`、`phases.yml` 和所有阶段 `exit.artifacts`。
- `watchAutoRun=false` 默认只标 stale，不运行检查。
- `watchAutoRun=true` 时每个项目根运行一次 probe，并向相关 session 提交 fresh snapshot。
- 项目级 probe 通过传入 pre-step 的 callback 执行，避免 watcher 与 pre-step 循环依赖。

测试：

```text
test/p7-realtime.test.mjs
tests 13
pass 13
fail 0
```

全量：135/135 通过。

## 12. P7.3.2 焦点/键盘硬化验收

- StageRail dialog 使用 `tabIndex=0`，打开时调用 focus。
- Tab 被限制在 dialog 容器；Escape 返回触发按钮。
- Audit 阶段行支持 ArrowUp、ArrowDown、Home、End。
- 自动测试通过；真实宿主关闭/重开、分栏/浮窗、暗色主题和 Escape 焦点返回均已完成走查。


## 13. P7.3.2/P7.3.3 收尾硬化与真实宿主门

### 本地回归

- P0–P7 全量：135/135 通过。
- P7.2 watcher 专项：13/13 通过。
- P5 pre-step、P6 client、P7 realtime 联合专项全部通过。

### 对抗复核修复

- 并发首次注册同一项目根时共享一个 `ready` Promise，不再互相关闭初始化。
- watcher 初始化设置 5 秒 ready timeout；超时后 abort、关闭并删除 pending 项目。
- `session/disposed` 订阅使用 sentinel 去重，即使宿主不返回 disposer 也不会重复订阅。
- root 切换先完成新 watcher 初始化再切换映射；失败时保留旧 root watcher。
- pre-step 在投影尚未落地时也会用 committed fingerprint 去重，避免重复注入。
- Tab 仅在焦点位于 dialog 子树时阻止默认行为，不再全局劫持宿主键盘导航。

### 真实 DSH web 走查

- Dock 与右栏 `ML 阶段审计` 正常渲染 summary、nextExit、history 和 M0–M8。
- 关闭 audit tab 后可重新打开；分栏与拖拽浮窗正常。
- 阶段详情打开后连续 Tab，焦点保持在 dialog；Escape 关闭并把焦点返回“展开阶段详情”。
- 审计行 ArrowDown 将焦点移动到下一行 listitem。
- 深色主题下审计浮窗、阶段轨道与阶段详情 token fallback 可读。
- 首次走查截图：`<workspace>\ml-phase-visual-fixture\p7.3-dark-audit.png`、`p7.3-dark-stage-details.png`。

### 未证明边界

- probe 已启动后不能中止其内部验证子进程，只能由 `checkTimeoutMs` 限定运行时长。
- 同一项目根跨多个 DSH 进程仍各自持有 watcher；当前去重范围是一个 DSH 进程内。
