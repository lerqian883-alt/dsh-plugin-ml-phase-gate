# P6 客户端可视化验收

> P6 范围：web client bundle、`conversation.input.dock` 阶段轨道、双游标、badge、悬停/点击详情、`nextExit` 投影扩展。
> 不包含：P7 右栏审计视图、实时推送、历史回放和宿主视觉硬化。

## 1. P6 任务清单

| 编号 | 任务 | 交付物 | 状态 |
|---|---|---|---|
| P6.1 | 设计并实现客户端 bundle | `lib/client.js`、`lib/client.d.ts` | 完成 |
| P6.2 | 实现双游标阶段轨道 | `buildRailModel`、`StageRail` | 完成 |
| P6.3 | 实现三态 Dock | `MlPhaseDock` | 完成 |
| P6.4 | 实现 gap/defer/next badge | `Tag` 条件渲染 | 完成 |
| P6.5 | 实现悬停/点击详情 popover | `StageRail` details | 完成 |
| P6.6 | 扩展 `nextExit` 与版本迁移 | `codec.js`、`schemas.js`、`contracts.js` | 完成 |
| P6.7 | 注册 locale 与 dock 槽位 | `apply`、`package.json` | 完成 |
| P6.8 | 补渲染层测试 | `test/p6-client.test.mjs` | 完成 |
| P6.9 | Claude Code 对抗评审 | `docs/P6-ADVERSARIAL-REVIEW.md` | 完成 |

## 2. 本地验收

命令：

```powershell
node --test --test-isolation=none test\p0-contracts.test.mjs test\p1-skeleton.test.mjs test\p2-yaml.test.mjs test\p2-phases.test.mjs test\p2-project-root.test.mjs test\p2-state.test.mjs test\p3-evidence.test.mjs test\p4-tools.test.mjs test\p5-projection.test.mjs test\p6-client.test.mjs
```

结果：

```text
tests 107
pass 107
fail 0
```

P6 专项：

```powershell
node --test --test-isolation=none test\p6-client.test.mjs
```

```text
tests 11
pass 11
fail 0
```

覆盖：

- web client bundle、`./client` types、`dsh.client` manifest。
- `buildRailModel` 双游标、gap、next、null。
- `MlPhaseDock` 能力缺失/undefined、null、对象三态。
- `StageRail` danger/warning/info badge。
- open popover 的 `role="dialog"`、`aria-expanded`、checks/artifacts/pitfalls/defer 文本。
- closed popover 无 dialog、按钮点击与 hover setter 接线。
- `nextExit` 构建、fingerprint、schema、v1→v2 迁移和未知版本拒绝。

## 3. 核心实现裁决

1. 客户端只读 `mlPhase` 投影：
   - 不读 `phases.yml`。
   - 不运行检查。
   - 不重新计算 `evidenced` / `gap`。
2. 双游标：
   - evidence 游标左侧为 `done`。
   - declared 游标标记声明位置。
   - evidence 与 declared 之间为 `error` gap。
   - `evidenced = null` 不画红段。
   - evidence 推导的 next 为 `ongoing`。
3. 样式交付：
   - 手写 bundle 使用 inline style；P6 契约修正明确记录该受控偏离。
   - 颜色/圆角/阴影/背景优先使用宿主 token。
   - 所有 CSS 变量带 fallback。
4. `nextExit`：
   - 快照 v2 携带 checks/artifacts/commonPitfalls。
   - projection v2 的 `stateVersion = 2`。
   - v1 快照可迁移，未知版本 fail closed。
5. 注册：
   - slot `conversation.input.dock`，id=`ml-phase`，order=`5`，locale=`mlPhase`。

## 4. P0–P5 回归

- P0 版本测试更新为 `SNAPSHOT_VERSION=2`、`PROJECTION_VERSION=2`。
- P5 投影测试更新为 v2 fixture，并新增 v1 迁移测试。
- P1 安装链、P2 阶段状态、P3 证据闸门、P4 工具输出均通过全量回归。
- `nextExit` 新增字段仍兼容旧 v1 snapshot 消息。

## 5. 真实宿主门

已完成第一轮冒烟：

```powershell
dsh plugin --profile web add link:"<dsh-workspace>\.dsh\plugins\ml-phase-gate"
dsh --profile web --dump-config
dsh --profile web --no-open --port 0
```

结果：

- link 安装成功。
- `--dump-config` 的组合树出现 `id: ml-phase-gate`、`name: dsh-plugin-ml-phase-gate`。
- web 服务成功启动并打印随机端口 URL，未出现 `client bundle not found` 或 client-modules 解析错误；启动冒烟后立即停止服务。

浏览器视觉门已完成，使用 `ml-workspace` 工作区临时 fixture，触发一条无害消息让 `agent/pre-step` 播种投影，并在 1440×900 视口观察：

- 9 个阶段节点正确渲染：M0/M1 绿色完成，M2 红色证据缺口，M3–M8 灰色未开始。
- declared 游标显示为 M2；`M2 差距 1`、`人工覆盖`、`下一步 M2` badge 均出现。
- 点击“展开阶段详情”后 popover 打开，`aria-expanded=true`，内容为：
  - 声明 M2
  - 证据 M1
  - 差距 1
  - 下一步 M2
  - 检查 012
  - 工件 outputs/m2.json
  - 常见坑 数据泄漏; 指标漂移
  - 人工覆盖 visual gate: known issue
- 浏览器 console 无相关错误；服务启动日志无 client-modules / bundle 错误。
- `Tooltip` / `StateDot` / `Tag` 的真实宿主 props 与当前实现兼容。

截图证据：

- `<workspace>\ml-phase-visual-fixture\p6-visual-gate-desktop.png`
- `<workspace>\ml-phase-visual-fixture\p6-visual-gate-rail.png`

已知非阻断边界：更窄的默认 in-app 视口下，横向阶段轨道会被 `overflow:hidden` 裁剪；正常桌面视口完整可见。窄屏、暗色主题、密度主题和完整键盘焦点管理归 P7 硬化。

## 6. 边界与后续风险

- P6 不包含右栏审计视图。
- P6 不包含实时推送；仍依赖 pre-step 和工具成功后的 deferred snapshot 更新投影。
- `role="dialog"` 尚未实现 Esc 关闭和完整焦点管理，归 P7 硬化。
- 真机视觉、窄屏、暗色主题和密度主题仍需实际走查。
- 外部直接修改 `state.json` 仍受 pre-step TTL 影响，P7 可考虑 watcher。

## 7. P6 退出条件

- P6 专项 11/11、全量 107/107 通过。
- 四个 P6 必修项闭合。
- README、契约修正、实现逻辑、验收和对抗评审文档齐备。
- 真实插件目录同步后通过安装链冒烟；真机视觉与交互另列证据门。