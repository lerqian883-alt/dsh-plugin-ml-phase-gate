# ML Phase Gate 插件总体架构（P0 冻结稿）

> 状态：P0 架构冻结。
> 基准宿主：`@deepseek-ai/dsh@0.1.7-rc.2`。
> 插件根目录：`<dsh-workspace>\.dsh\plugins\ml-phase-gate`。
> 本文只冻结总体架构与边界，不实现 P1 的插件加载骨架。

## 1. 目标与非目标

### 1.1 目标

在 DeepSeek Harness/DSH 中实现一个机器学习流程闸门插件，使用户和模型能够：

1. 看见标准 ML 流程的阶段定义。
2. 看见项目当前处于哪个声明阶段。
3. 看见证据实际支持到哪个阶段。
4. 看见声明与证据之间的差距 `gap`。
5. 在 harness 界面中获得实时、常驻、低成本的阶段可视化。
6. 在阶段推进前执行机器可查的出口判据。
7. 对人工覆盖进行留痕，并让覆盖状态可见。

### 1.2 非目标

P0 不处理以下事项：

- 不实现插件加载和安装（P1）。
- 不实现阶段定义文件解析（P2）。
- 不实现证据执行（P3）。
- 不实现工具面（P4）。
- 不实现上下文注入和投影（P5）。
- 不实现客户端 UI（P6）。
- 不复制 DSH Web 外壳，不 fork harness 布局。
- 不宣称插件是绝对强制机制；真正的牙齿是 `work/checks`。

## 2. 设计支点：声明相位 vs 证据相位

| 概念 | 含义 | 来源 | 是否落盘 |
|---|---|---|---|
| `declared` | agent 或用户声明的当前阶段 | `state.json` | 是 |
| `evidenced` | 证据实际支持到的阶段 | 每次现跑 `work/checks` | 否 |
| `gap` | `declared - evidenced` | 由前两者计算 | 否 |
| `next` | 下一个应推进的阶段 | 判定引擎计算 | 否 |

设计结论：

- “现在处于哪个阶段”不能靠读取散落文档判断。
- `state.json` 只记录声明、迁移史和 defer。
- `evidenced` 每次重算，避免篡改从“证据”扩大到“结论”。
- UI 的核心价值是让 `declared > evidenced` 一眼可见。

## 3. 三层运行位置

```text
项目侧
  phases.yml          标准流程定义
  state.json          项目声明真相
  work/checks/*.ps1   阶段出口证据

主机半（Cordis 插件）
  阶段加载 / 状态存储 / 证据执行
  判定引擎 / 工具面 / 注入 / 投影

客户端半（DSH Web 插件）
  conversation.input.dock 阶段轨道
  工具卡 / 右栏明细 / 会话卡片
```

## 4. 五层真源

```text
① <project>\.dsh-ml-phase\phases.yml
   阶段定义单一真源

② <project>\.dsh-ml-phase\state.json
   声明相位 declared + 迁移史 + defer

③ <project>\work\checks\*.ps1
   阶段出口的可执行证据

④ 会话投影 mlPhase
   ①②③ 的当前会话镜像

⑤ conversation.input.dock
   只渲染 ④，不重新判断业务
```

## 5. 主机半与客户端半边界

### 5.1 主机半负责

- 发现项目根。
- 加载和校验阶段定义。
- 读写项目状态。
- 运行证据检查。
- 计算 `PhaseEvaluation`。
- 注册 `ml_phase_status`、`ml_phase_advance`、`ml_phase_defer`、`ml_phase_phases`。
- 通过 `agent/pre-step` 注入快照。
- 注册 `mlPhase` 会话投影。
- 产出客户端可消费的 wire schema。
- 执行项目自有检查；授权边界等同 shell 工具。
- 工具只接受当前会话派生的 projectRoot。

### 5.2 客户端半负责

- 注册 `conversation.input.dock` 条目。
- 用 `useProjection('mlPhase')` 读取投影。
- 渲染投影携带的 `phases` 列表（默认九点轨道，项目可覆盖）。
- 渲染 gap 红标、defer 标记和证据摘要。
- 处理 `undefined`、`null`、对象三种投影状态。
- 使用宿主 token 和 primitives 保持视觉一致。

### 5.3 客户端半禁止

- 不读磁盘。
- 不运行检查。
- 不自己推导 `evidenced` 或 `gap`。
- 不新增未声明槽位。
- 不直接写宿主 store。
- 不 import 非平台种子模块。

## 6. 核心数据流

### 6.1 会话播种

```text
agent/pre-step
  -> 从 SessionHeader.cwd 找项目根
  -> 读 phases.yml + state.json
  -> 运行阶段出口检查
  -> 计算 PhaseEvaluation
  -> 构造 MlPhaseSnapshot
  -> 仅当 state.json 存在且 declared 非空时
  -> 用忽略 updatedAt/checkedAt 的 fingerprint 判断投影是否过期
  -> fingerprint 变化，追加一条 user/message
  -> source.kind = "ml-phase-gate"
  -> session projection 折叠为 mlPhase
  -> 客户端 useProjection('mlPhase')
```

### 6.2 阶段推进

```text
agent 调用 ml_phase_advance
  -> 获取项目级写锁
  -> 运行目标阶段的出口检查
  -> 检查失败：不写 state.json，返回 blockers + 原始输出
  -> 检查通过：写 state.json，清除 defer，追加快照
  -> 投影更新
  -> Dock 轨道前进
```

前向推进只允许 `to === next`。跳阶段报 `E_INVALID_TRANSITION`。

返回早期阶段属于 rollback，必须提供 `reason`，不要求目标阶段出口检查通过，且不得删除历史。

### 6.3 人工覆盖

```text
ml_phase_defer(reason)
  -> 验证 reason 非空
  -> 写 defer 记录
  -> 追加快照
  -> UI 显示 defer 标记
```

## 7. 会话桥接规则

DSH 的 session projection 是：

- 纯同步 fold。
- 整值规则：状态事件必须携带变更后的完整状态。
- 会话作用域。
- `apply` 对不关心的事件必须返回同一个状态引用。

因此：

1. `init` 不能读磁盘。
2. 播种必须发生在事件层。
3. 不新增自定义会话事件类型。
4. 使用已知的 `user/message` + `source.kind` 作为扩展点。
5. 一次 `agent/pre-step` 注入同时负责：
   - 提醒模型；
   - 写入整值快照；
   - 生成可折叠的上下文注入行。

## 8. 客户端席位选择

首选：

```text
slot:        conversation.input.dock
kind:        list
scope:       session
replaceRisk: none
dock id:     ml-phase
order:       5
locale:      mlPhase
```

选择理由：

- 该席位语义是“输入框上方的全宽条目”。
- 现有 occupant 有 `todo`、`goal`、`queue`。
- 使用新的 `id` 不会遮蔽现有条目。
- `order: 5` 落在 `todo`(0) 与 `goal`(10) 之间。
- 注册必须包在 `ctx.slots.inject` 中。

备选顺序：

```text
conversation.input.dock
  -> sidebar.right.pane.tab
  -> tool.call.toolview
```

## 9. 模块地图

| 模块 | 位置 | 责任 |
|---|---|---|
| `contracts` | `lib/contracts.js` | P0 冻结常量和类型 |
| `project-root` | `lib/project-root.js` | 从 cwd 找项目根 |
| `phases` | `lib/phases/` | 加载、合并、校验阶段定义 |
| `state` | `lib/state/` | 读写 `state.json`，项目级写锁 |
| `evidence` | `lib/evidence/` | 运行检查，收集工件证据 |
| `engine` | `lib/engine/` | 计算 `PhaseEvaluation` |
| `tools` | `lib/tools/` | 四个工具及输出 schema |
| `snapshot` | `lib/snapshot/` | 快照编解码和提示词 |
| `inject` | `lib/inject/` | `agent/pre-step` 注入与播种 |
| `projection` | `lib/projection/` | 注册 `mlPhase` 投影 |
| `client` | `src-client/` | Dock、轨道、locale、样式 |
| `audit` | `lib/audit/` | defer、迁移史、产物印记 |
| `realtime` | `lib/realtime/` | 可选 watcher/remote 通道 |

## 10. 强制力等级

| 等级 | 机制 | P0 结论 |
|---|---|---|
| L0 | 只写文档 | 不采用 |
| L1 | 每轮上下文注入 | 必做 |
| L2 | 证据闸门：不过不写状态 | 必做 |
| L3 | 工具/步骤拦截 | 可实现，默认关闭 |
| L4 | 产物相位印记 | 后续必做 |
| L5 | 客户端可视化 | 必做，是控制回路 |

## 11. 版本与演进规则

- `CONTRACT_VERSION` 当前为 `1`。
- 删除或重命名字段必须 bump。
- 修改字段语义必须 bump，并写迁移说明。
- Session projection 的序列化状态字段形状或 fold 语义变化必须 bump `stateVersion`。
- 快照 wire shape 变化必须 bump `snapshot.version`。
- `state.json` schema 变化必须 bump `state.version` 并提供迁移策略。
- `phases.yml` schema 变化必须 bump `phases.version`。

## 12. P0 决策记录

| 编号 | 决策 | 理由 |
|---|---|---|
| D-001 | 磁盘是项目真相，投影是会话镜像 | 投影换会话即空 |
| D-002 | `evidenced` 不落盘 | 防止结论可篡改 |
| D-003 | 使用 `user/message` + `source.kind`，不新增事件类型 | 保持会话冷读安全 |
| D-004 | 首选 `conversation.input.dock` | 宿主已有同构先例且 replaceRisk 为 none |
| D-005 | UI 只读 `mlPhase` 投影 | 客户端不含业务判断 |
| D-006 | `advance` 检查失败不写盘 | 保证“红了就不算通过” |
| D-007 | defer 必须可见 | 防止人工覆盖变成隐藏失效面 |
| D-008 | P0 只写契约和最小测试，不实现加载骨架 | 保持 P0/P1 边界 |

## 13. 参考证据

以下为本机已核实的宿主文件：

- `<user-home>\AppData\Roaming
pm
ode_modules\@deepseek-ai\dsh
ode_modules\@deepseek-ai\dsh-session-projection\lib\types\index.d.ts`
- `<user-home>\AppData\Roaming
pm
ode_modules\@deepseek-ai\dsh
ode_modules\@deepseek-ai\dsh-session\lib\index.js`
- `<user-home>\AppData\Roaming
pm
ode_modules\@deepseek-ai\dsh
ode_modules\@deepseek-ai\dsh-time-context\lib\index.js`
- `<user-home>\AppData\Roaming
pm
ode_modules\@deepseek-ai\dsh
ode_modules\@deepseek-ai\dsh-tool-todo\lib\index.js`
- `<user-home>\AppData\Roaming
pm
ode_modules\@deepseek-ai\dsh
ode_modules\@deepseek-ai\dsh-client-ui-slots\lib\index.js`
- `<user-home>\AppData\Roaming
pm
ode_modules\@deepseek-ai\dsh
ode_modules\@deepseek-ai\dsh-client-ui-goal\lib\client.js`
- `<user-home>\AppData\Roaming
pm
ode_modules\@deepseek-ai\dsh
ode_modules\@deepseek-ai\dsh-client-ui-conversation\lib\types\client\contract\slots.d.ts`
- `<user-home>\.dsh\profiles\web\package.json`





## P8. 激活策略

插件挂载后由 `activationMode` 决定运行时策略：

```text
auto
  Host: 正常项目检测与闸门注册
  Client: 无阶段快照时隐藏 Dock

always
  Host: 正常项目检测与闸门注册
  Client: 无阶段快照时显示“未开始”

off
  Host: 不注册工具、projection、pre-step、watcher
  Client: 无可见 Dock/Audit 内容
  彻底卸载静态 client bundle: 使用 DSH 插件管理器禁用插件
```

该配置不改变 `state.json`、snapshot 或 projection wire shape。安装层的硬开关仍由 DSH 插件管理器或 profile patch 负责。


## P9. 发布与可插拔性

- 默认验证入口：`work/verify.cmd`、`work/verify.ps1`、`work/verify.mjs`、`work/verify.sh` 自动发现。
- `scripts/bootstrap-project.mjs` 初始化 ML 项目骨架。
- `examples/minimal-ml-project` 和 `examples/node-ml-project` 提供可运行示例。
- `scripts/check-package.mjs`、`scripts/smoke-install.mjs` 和 GitHub Actions 提供发布门。
- `npm pack` 产物经过文件白名单和本机路径扫描。
- 发布包不依赖作者本机绝对路径。
