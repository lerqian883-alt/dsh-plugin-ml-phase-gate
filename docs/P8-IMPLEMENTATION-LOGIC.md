# P8 激活策略与可开关启动

> 状态：实现完成，真实宿主三模式已走查。
> 目标：让插件在“自动可视化”和“非 ML 项目安静降级”之间可配置，同时保持 Host 为唯一配置源。
> 核心结论：`dsh.client` 静态 bundle 不接收 Host 行配置，因此浏览器半侧必须通过只读 projection 读取激活模式，而不能直接读取 `cordis.patch.yml` 的 `activationMode`。

## 1. 问题

当前插件安装到 web profile 后：

- Host 在每个 `agent/pre-step` 尝试查找 ML 项目；
- Client 在 `conversation.input.dock` 注册 `ml-phase`；
- 没有阶段投影时 Client 会显示“未开始”。

这在 ML 项目中合理，但在普通软件项目中会造成无意义 UI。P8 将“安装/挂载”和“运行时激活”分开：

```text
DSH 插件管理器 / profile patch
  -> 是否安装或挂载插件

activationMode
  -> 运行时 Host 能力和 Client 可见性
```

## 2. 冻结配置

只新增一个运行时配置：

```ts
type ActivationMode = 'auto' | 'always' | 'off';

interface PluginConfig {
  // P0-P7 既有字段
  activationMode?: ActivationMode;
}
```

默认值：

```yaml
activationMode: auto
```

不新增独立 `enabled` 布尔值，避免与 DSH 插件管理器的安装开关和 `off` 模式产生优先级冲突。

## 3. Host 语义

### `auto`

- 注册四个工具、`mlPhase` projection、activation projection、pre-step 和 watcher。
- 没有 ML 项目或没有 state 快照时，Host 不注入阶段快照。
- activation projection 暴露 `{ mode: 'auto' }`。

### `always`

- Host 注册能力与 `auto` 相同。
- activation projection 暴露 `{ mode: 'always' }`。
- Client 在没有阶段快照时显示“未开始”。

### `off`

- 不注册工具、projection、pre-step、watcher。
- 不注册 activation projection。
- Client 看不到激活信号，Dock/Audit 内容不渲染。
- 要完全卸载浏览器静态 bundle，应使用 DSH 插件管理器禁用插件；`off` 是运行时静默，不负责动态取消静态 `dsh.client` 注册。

## 4. Client 桥接

Client 不能读取 Host 行配置；它通过：

```js
useProjection('mlPhaseActivation')
```

读取：

```js
{ mode: 'auto' | 'always' }
```

行为：

- activation projection 缺失 -> 按 `auto` 保守处理，不显示内容。
- `auto` + `mlPhase` 为 `null/undefined` -> Dock/Audit 都不渲染。
- `always` + `mlPhase` 为 `null/undefined` -> Dock 显示“未开始”，Audit 显示空态。
- `mlPhase` 是对象 -> 正常显示阶段轨道和审计内容。

`mlPhaseActivation` 是只读运行时信号，不进入 `state.json`、snapshot wire shape 或阶段迁移历史。

## 5. Projection 契约

新增：

```js
export const ACTIVATION_PROJECTION_KEY = 'mlPhaseActivation';
```

注册内容：

```js
{
  mode: 'auto' | 'always'
}
```

规则：

- `activationMode=off` 时 Host 不注册该 projection。
- `auto/always` 时 `init()` 直接返回模式对象。
- `apply` 对该 projection 是幂等只读 fold。
- schema 只接受三个合法枚举；Client 读取到非法值时不采用。

## 6. 配置示例

默认：

```yaml
- id: ml-phase-gate
  name: dsh-plugin-ml-phase-gate
  config:
    activationMode: auto
```

所有会话显示未开始入口：

```yaml
activationMode: always
```

Host 与 UI 运行时静默：

```yaml
activationMode: off
```

保留 P7 安全默认：

```yaml
watchAutoRun: false
```

## 7. 测试策略

- P0：冻结 `ACTIVATION_MODES`、`ACTIVATION_PROJECTION_KEY` 和默认配置。
- P1：Host 接受三个合法值，拒绝未知值；`off` 不调用 effect、tools、projection、pre-step 或 watcher。
- P5：`registerProjection(..., 'always')` 注册 `mlPhase` 和 `mlPhaseActivation`，并验证 mode。
- P6：`auto` 隐藏空 Dock；`always` 显示空 Dock；activation projection 覆盖 Client fallback。
- P7：`auto` 下 Audit 空态返回 null；`always` 下保留空审计态。
- P6/P7：`off` 时不产生可见 Dock/Audit 内容。

## 8. 不在 P8 范围

- 不动态卸载 `dsh.client` 静态注册；
- 不做跨 DSH 进程 watcher 共享；
- 不做运行时热切换 UI；
- 不改变 `work/verify.cmd`、证据闸门和阶段推进语义；
- 不引入项目级 `enabled` 文件。

## 9. 实现与复核记录

- Host 和 Client 的 activation mode 通过 projection 对齐，不依赖静态 bundle config。
- Client 对 `mlPhaseActivation` 缺失采用 auto 保守降级。
- `auto` 下 Dock/Audit 都不渲染空态。
- `always` 下 Dock 显示“未开始”，Audit 显示空态。
- `off` 下 Host 不注册能力，Client 不产生可见内容。
- 真实宿主走查：
  - `auto`：无阶段快照会话不显示 ML Dock。
  - `always`：无阶段快照会话显示“未开始”。
  - `off`：不显示 ML Dock/Audit 内容。
- 第一轮只读评审发现 2 个 Medium；第二轮确认修复后无 Blocker/High。
