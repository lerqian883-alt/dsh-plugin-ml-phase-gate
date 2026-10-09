# P7.1 对抗式评审记录

> 评审工具：Claude Code CLI 2.1.289。
> 评审模式：只读、对抗式、尝试证伪。
> 原始输出：`docs/P7-ADVERSARIAL-REVIEW.raw.md`。
> 评审边界：只检查 P7.1 右栏审计页，不声称 P7.2/P7.3 完成。

## 1. 首轮结论

**有条件通过**。两阶段注册和审计页投影消费没有可证伪的缺陷，测试不是假测试，P6 未被破坏；但有五个 P7.1 必修项。

## 2. 必修项与处置

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P7-R01 | 高 | 文档说无 `sidebarRight` 不显示入口，代码却始终注入 `openAudit` | `apply` 改为仅在 `sidebarRight.openTab` 存在时提供 `inject`；已补“服务缺席”测试 |
| P7-R02 | 高 | `mounted` 只判断 `undefined`，`null` 时会继续调用 fail-loud `openTab` | `openAuditTab` 和 injection 都改为 `mounted == null` 安全返回；已补 undefined/null 测试 |
| P7-R03 | 中 | `lib/client.d.ts` 与实现的 inject/context 不一致 | 重写 `lib/client.d.ts`，同步四元 inject 和 sidebarRight 类型 |
| P7-R04 | 中 | `docs/CONTRACTS.md` 缺 P7 修正节 | 增加“P7 契约修正：右栏审计页”节，冻结 tab id/kind、slot、Dock injection 和版本边界 |
| P7-R05 | 中 | README 引用不存在的 P7 评审文档 | 本文件与 raw 记录已补齐；README 索引现在有实际文件 |

## 3. 额外清理

- 删除未使用的 `audit.defer` 和 `node.defer` i18n 键。
- `package.json` description 更新为 P7.1。
- 增加 `sidebarRight`/`sidebarRightTabs` 的能力检测与降级测试。
- P7.1 专项测试从 4 项增加到 6 项。
- 全量测试从 111 项增加到 113 项；P7.3.1 增加 1 项后为 114 项。

## 4. 第二轮状态

**代码级 blocker 已闭合，主路径真实宿主门已通过。** 已确认：

- `ctx.slots.register({ inject })` 对 `conversation.input.dock` 可用。
- Dock “打开审计”按钮能调用 `sidebarRight.openTab`。
- `sidebar.right.pane.tab` 注册成功，真实右栏打开 `ML 阶段审计`。
- `useProjection`、locale title/body 和审计渲染均可用。

仍待 P7.3 视觉门覆盖：

- 从 guide“添加”入口打开 audit tab。
- 关闭/重新打开、分栏/浮窗、窄屏、暗色/密度主题和 Esc/焦点行为。

## 5. 已证伪/误报

- 未发现 tab id、kind 或 slot key 冲突。
- `MlPhaseAudit` 没有读盘、运行检查或写路径。
- `undefined` / `null` / 对象三态渲染与投影字段消费正确。
- 测试行为性是实际断言，不是镜像实现的假测试。
- P6 dock 的三态和 popover 测试仍通过。

## 6. 当时剩余边界（后续已解决）

- P7.2 实时刷新与历史回放当时未实现；最终见 §10–§12。
- P7.3 窄屏、暗色/密度主题、Esc、焦点管理和审计列表语义当时未实现；最终见 §13–§14。
- `translate` 在 locale.bind 缺席时仍回退显示原始 key；真实宿主已确认正常 bind，回退仅作为防御性默认。
## 7. 真实宿主追加发现

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P7-R06 | 高 | `localeText` 剥离 `ctx.locale.bind` 后丢失 `this`，tab title/description 求值崩溃，audit tab 无法打开 | 改为 `locale.bind(NS)`；测试 fake locale 强制检查 `this`；修复后真实宿主 audit tab 正常打开 |

修复后的真实 DSH web 验证：

- Dock 的“打开审计”按钮可见并可点击。
- 右栏成功打开 `ML 阶段审计` tab。
- summary、nextExit、defer、M0–M8 阶段清单全部渲染。
- 浏览器相关 console error 为空。
- 截图：`<workspace>\ml-phase-visual-fixture\p7-audit-panel.png`。

## 8. P7.3.1 真实宿主硬化复核

- 窄视口阶段轨道：`overflowX=auto`、`clientWidth=120`、`scrollWidth=569`、可滚动。
- Escape：popover 从展开变为 `aria-expanded=false`。
- 焦点：Escape 后焦点返回“展开阶段详情”按钮。
- audit 页：真实右栏打开并显示 summary、nextExit、defer 与 M0–M8。
- audit 语义：本地测试锁定 `region` / `list` / `listitem`、`tabIndex=0` 和行级 aria-label。

后续已覆盖：暗色主题、关闭/重开、分栏/浮窗和受限焦点保持，见 §14。

## 9. P7.2.1 对抗式评审与修复

第二轮只读评审结论：watcher 不自动运行检查成立，status 刷新成立，但有 5 个必修项。

处置：

| 编号 | 发现 | 修复 |
|---|---|---|
| P7.2-R01 | suppression 只延迟事件，窗口到期后仍标 stale | suppression 窗口内直接丢弃事件；测试等待窗口结束仍为 0 条 |
| P7.2-R02 | session/disposed 不释放 watcher | 注册 `ctx.on('session/disposed')`，关闭并删除对应 watcher |
| P7.2-R03 | v2→v3 迁移丢失 nextExit | 仅 v1 置 null；v2 保留并校验 nextExit |
| P7.2-R04 | watcher 测试覆盖不足 | 增加 debounce 合并、幂等、session disposed、suppression 丢弃、v2 nextExit 测试 |
| P7.2-R05 | watch.js 死常量、contracts typedef 漂移 | 删除死常量；补齐 stale/staleAt typedef |

仍未实现/保留：

- 多 session 同项目 watcher 去重。
- artifact watcher。
- opt-in 自动检查。
- `ml_phase_status` 连续调用的 fingerprint 去重。

修复后全量回归为 124/124，P7.2 watcher 专项为 7/7。


## 10. P7.2.2 history 回放

P7.2.2 在 P7.2.1 watcher 之上增加了 `state.json.history` 的只读投影。审计页现在显示最近的迁移摘要，但不会把 UI 变化写回项目历史。全量回归为 124/124。

## 11. P7.2.3 committed snapshot 去重

新增 committed snapshot WeakMap；pre-step、watcher stale 和 deferSnapshotContext 都更新该值。`ml_phase_status` 连续调用若 fingerprint 相同，只失效缓存/建立 suppression，不重复追加会话消息。P7.2 专项 7/7，全量 124/124。

## 12. P7.2.4 项目级 watcher 优化

- 同一项目根的多个 session 共享一组 watcher。
- `session/disposed` 只移除对应 session；最后一个退出时关闭 watcher。
- 监听 state、phases 和所有 `exit.artifacts`。
- `watchAutoRun=false` 默认只标 stale。
- `watchAutoRun=true` 时每个项目根只运行一次 probe，并向所有相关 session 提交 fresh snapshot。
- 该阶段回归 127/127、P7.2 专项 10/10；最终结果见 §14。

## 13. P7.3.2 焦点/键盘硬化

- StageRail popover 增加 dialog focus 和 Tab trap。
- Audit rows 增加 ArrowUp/Down/Home/End 导航。
- 这些行为由 P6/P7 客户端测试锁定；真实宿主的关闭/重开、分栏/浮窗和暗色主题已在 §14 完成走查。


## 14. P7.2/P7.3 第三轮只读评审与收尾

第三轮 Claude Code 只读评审结论：无 Blocker；发现 3 个 High、3 个 Medium。

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P7.3-R07 | High | pre-step 仅比较当前 projection；projection 尚未落地时 committed snapshot 相同仍会重复注入 | 同时比较 committed；新增 P5 专项测试 |
| P7.3-R08 | High | Tab trap 挂在 document 上，popover 打开时会吞掉宿主全局 Tab | 改为仅在焦点位于 dialog 子树时保持焦点；Escape 监听保留 |
| P7.3-R09 | High | watcher 初始化无限 await，宿主 resolve/watch 卡住会阻塞 agent turn | 增加 5 秒 ready timeout；超时 abort、关闭并清理 pending 项目 |
| P7.3-R10 | Medium | 宿主 on 不返回 disposer 时，每次 pre-step 可能重复订阅 session/disposed | 使用 null sentinel 记录已订阅状态；新增测试 |
| P7.3-R11 | Medium | root 切换先断开旧 watcher，新 root 初始化失败后 session 失去映射 | 新 root ready 后再切换映射；新增失败回退测试 |
| P7.3-R12 | Medium | probe 开始后无法取消其内部验证子进程 | 保留为已知边界，由 checkTimeoutMs 限定；页面提交 race 已由 live session 复检关闭 |

第二轮复核已完成，未发现新的 Blocker/High。随后补齐复核列出的三个 Low：

- `disposeAllWatches` 无论 disposer 是否为函数都清理 sentinel。
- `project.ready` 增加 reject 兜底，失败时移除项目并返回 false。
- P6 测试增加 Tab containment 仅限 dialog 子树的回归断言。

### 真实宿主走查

- audit tab 可关闭并重新打开；分栏受宿主右栏两格上限约束。
- audit tab 可拖拽为浮窗，关闭与收回到侧边栏正常。
- 阶段详情打开后连续 Tab，焦点保持在 dialog；Escape 关闭并返回触发按钮。
- audit listitem 支持 ArrowDown 移动到下一行。
- 深色主题下阶段轨道、审计浮窗和阶段详情均可读。
- 截图：`<workspace>\ml-phase-visual-fixture\p7.3-dark-audit.png`、`p7.3-dark-stage-details.png`。

### 回归

- P0–P7 全量：135/135 通过。
- P7.2 watcher 专项：13/13 通过。
- P5/P6/P7 联合专项全部通过。
