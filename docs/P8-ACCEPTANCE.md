# P8 激活策略验收

> 目标：实现 `activationMode=auto|always|off`，让 ML 项目自动显示流程，非 ML 项目安静降级，并支持运行时静默与插件管理器硬开关。

## 1. 交付

- `activationMode` 配置与冻结常量。
- Host activation projection：`mlPhaseActivation`。
- Client 通过 projection 读取模式，不读取静态 bundle 配置。
- `auto`：无阶段快照时不显示 Dock/Audit 空态。
- `always`：无阶段快照时显示“未开始” Dock 和空审计态。
- `off`：Host 不注册工具、projection、pre-step、watcher；Client 不产生可见 ML UI。
- README、CONTRACTS、ARCHITECTURE 和 P8 实现逻辑文档已更新。

## 2. 本地与真实目录回归

开发和真实插件目录均执行：

```text
tests 141
pass 141
fail 0
```

专项覆盖：

- P0：activation mode、activation projection key、默认配置和 TypeScript 契约。
- P1：`off` 不调用 effect、tools、projection、pre-step、watcher。
- P5：注册 `mlPhase` + `mlPhaseActivation`，并验证 `always` mode。
- P6：`auto` 隐藏空 Dock，`always` 显示“未开始”，activation projection 覆盖静态 fallback。
- P7：`auto` 隐藏空 Audit，`always` 保留空审计态。

## 3. 真实 DSH web 门

- `dsh --profile web --dump-config` 显示：

```yaml
- id: ml-phase-gate
  name: dsh-plugin-ml-phase-gate
  config:
    activationMode: auto
```

- `auto`：无阶段快照会话不显示 ML Dock。
- `always`：无阶段快照会话显示“机器学习阶段 / 未开始”。
- `off`：无阶段快照会话不显示 ML Dock/Audit 内容。
- 每个模式都通过独立 DSH web 启动加载；验证完成后恢复 `auto`。

## 4. 已知边界

- `off` 是运行时静默，不动态卸载 `dsh.client` 静态注册。要彻底移除客户端 bundle，使用 DSH 插件管理器禁用插件。
- Audit tab 类型在 `auto/always` 静态注册；按 session 的空态由 activation projection 和 `mlPhase` projection 共同决定。
- activation projection 是只读 UI 信号，不进入 `state.json`、snapshot wire shape 或阶段迁移历史。
