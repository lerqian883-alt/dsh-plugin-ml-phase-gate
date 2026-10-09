# P8 对抗式评审汇总

## 1. 第一轮：配置与 UI 语义

结论：无 Blocker；发现 2 个 Medium、2 个 Low。

- Client 只校验部分配置可能造成 Host/Client 半激活。
- `auto` 只隐藏 Dock，没有隐藏空 Audit 内容。
- activation mode 镜像测试不够强。
- Client 类型面与 Host 配置面不一致。

处置：

- Client 增加完整配置校验。
- `MlPhaseAudit` 在 `auto` 下对空 projection 返回 null。
- 增加 mode/key 镜像测试。
- 扩展 Client 类型声明。

## 2. 第二轮：null 与静态 bundle 差异

结论：无 Blocker/High；确认第一轮 Medium/Low 已解析。

- `activationMode: null` 改为 fail loud，与 Host 一致。
- Audit 空态显式受 `activationMode` 控制。
- `off` 增加 watcher 未启动断言。
- Client enum 和 host config key 镜像测试补齐。

## 3. 第三轮：activation projection 架构

真实宿主发现 `dsh.client` 静态 bundle 不接收 Host 行配置，因此改为：

```text
Host activationMode
  -> mlPhaseActivation projection
  -> Client useProjection
  -> Dock/Audit 可见性
```

第三轮只读评审结论：6 项架构检查全部 PASS，无 Blocker/High。

保留的 Medium：

- `off` 下静态 Audit tab 类型仍可能被宿主列出，但 pane 内容为 null；彻底移除使用插件管理器禁用。
- 静态 fallback 与 Host 模式不一致时，现在缺失 activation projection 一律保守降级为 `auto`。

保留的 Low：

- projection key 字面量在静态 Client bundle 中重复，已加 mirror 断言。
- `activationSchema` 只接受 `auto/always`，`off` 永远不会产生 activation projection。
- Client 对未注册 projection key 的 host 行为按 `undefined` 处理；当前真实 DSH 已验证。

## 4. 结论

P8 在真实宿主中完成 `auto`、`always`、`off` 三模式验证。最终全量回归 141/141，真实插件目录 141/141。P8 可以作为当前版本的运行时激活策略交付。
