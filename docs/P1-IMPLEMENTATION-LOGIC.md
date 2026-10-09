# P1 实现逻辑：插件骨架与安装链

> 状态：P1 实现逻辑文档。
> 目标：让插件成为一个能被 DSH profile 安装、组合、卸载的 host-half skeleton。
> 本文只解释 P1 代码；P2/P3/P5/P6 的业务逻辑仍按 P0 契约推进。

## 1. P1 目标与非目标

### 1.1 目标

- 提供合法的 npm/ESM 包身份。
- 提供 `main`、`exports`、`types`。
- 提供 `dsh.bundle.patch`。
- 提供可被 DSH 组合的 `cordis.patch.yml`。
- 提供主机半入口 `lib/index.js`。
- 提供零依赖配置规范化 `lib/config.js`。
- 提供本地契约测试与安装 smoke 路径。
- 证明安装可逆：安装、验证、卸载、再安装。

### 1.2 非目标

P1 不做：

- 阶段定义解析。
- 项目状态读写。
- 证据执行。
- 工具注册。
- 上下文注入。
- 会话投影。
- 客户端 UI。
- 真实阶段判定。

## 2. 文档优先检索记录

### 2.1 检索路径

- `<dsh-workspace>\AGENTS.md`
- `<dsh-workspace>\.dsh\plugins\ml-phase-gate\DESIGN.md`
- `<dsh-workspace>\.dsh\plugins\ml-phase-gate\CONSTRUCTION.md`
- `<dsh-workspace>\.dsh\plugins\ml-phase-gate\BUILD-PLAN.md`
- `<dsh-workspace>\.dsh\plugins\ml-phase-gate\docs\ARCHITECTURE.md`
- `<dsh-workspace>\.dsh\plugins\ml-phase-gate\docs\CONTRACTS.md`
- `<user-home>\.dsh\profiles\web\node_modules\dsh-whale-widget\package.json`
- `<user-home>\.dsh\profiles\web\node_modules\dsh-whale-widget\cordis.patch.yml`
- `<user-home>\.dsh\profiles\web\node_modules\dsh-whale-widget\lib\index.js`
- `<user-home>\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-tool-todo\package.json`
- `<user-home>\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-tool-todo\lib\index.js`

### 2.2 关键结论

1. `dsh-whale-widget` 是第三方 DSH 插件的在跑先例：`main`、`cordis.patch.yml`、`dsh.bundle.patch` 三件套即可组成 profile 层。
2. 官方插件 `dsh-tool-todo` 使用 `export const name`、`export const inject`、`export function apply`，并可通过 `Config` 接收 schemastery 配置。
3. 第三方 `dsh-whale-widget` 没有导出 `Config`，说明 `Config` 不是 P1 加载的硬要求。
4. `dsh plugin --profile web add link:<path>` 是本地开发安装路径。
5. `.dsh/plugins/` 不是自动加载目录；必须安装进 profile。

## 3. P1 代码模块

### 3.1 `package.json`

职责：

- 声明包名、版本、ESM 类型。
- 声明 `main`、`types`、`exports`。
- 声明 `dsh.bundle.patch`。
- 提供 `test:p0`、`test:p1`、`test` 脚本。

关键不变量：

```text
name == dsh-plugin-ml-phase-gate
main == lib/index.js
dsh.bundle.patch == ./cordis.patch.yml
exports["."].default == ./lib/index.js
exports["./contracts"].default == ./lib/contracts.js
```

### 3.2 `cordis.patch.yml`

职责：

- 把插件插入 profile 组合树。

形状：

```yaml
- insert:
    - id: ml-phase-gate
      name: dsh-plugin-ml-phase-gate
      config: {}
```

P1 的 `config` 为空对象，确保 `normalizeConfig` 走默认值。

### 3.3 `lib/index.js`

职责：

- 导出 `name`。
- 导出空 `inject`。
- 导出 `apply`。
- 导出默认对象 `{ name, inject, apply }`。
- 建立 P1 生命周期 effect。
- 不注册任何业务资源。

生命周期逻辑：

```text
apply(ctx, config)
  -> normalizeConfig(config)
  -> 如果 ctx.effect 存在：
       注册 setup effect
    否则：
       test-only fallback：直接执行 setup，并返回 disposer
  -> setup 记录加载日志
  -> 返回 disposer，记录卸载日志
```

为什么 `inject` 为空：

- P1 不依赖 `tools`、`sessionProjections` 或其他服务。
- P2/P3/P5 只有在真正注册对应资源时才扩展 `inject`。
- 这样能避免“注入未使用服务”导致在不完整 profile 上永不 apply。

### 3.4 `lib/config.js`

职责：

- 从 `DEFAULT_CONFIG` 合并调用方配置。
- 拒绝未知配置键。
- 校验所有路径为项目相对路径。
- 校验超时和节流为非负安全整数。
- 冻结返回值和 `projectMarkers`。

路径校验逻辑：

```text
非空字符串
不含 NUL
不是 Windows 绝对路径
不是 UNC 绝对路径
不是 POSIX 绝对路径
按 / 和 \ 分段
拒绝空段、"." 和 ".."
```

这是 P0 契约中 `verifyCommand` 不得逃逸项目根的 P1 最小落实。

### 3.5 `lib/index.d.ts`

职责：

- 声明 `name`、`inject`、`apply` 和默认导出。
- 用结构性 `PluginContextLike` 避免 P1 引入 `@deepseek-ai/cordis` 类型依赖。
- 引用 P0 `PluginConfig`。

### 3.6 `test/p1-skeleton.test.mjs`

职责：

- 校验 `package.json` 的安装入口。
- 校验 `cordis.patch.yml` 的插入形状。
- 校验 `name`、`inject`、默认导出。
- 校验 `apply` 注册生命周期 effect。
- 校验无 `ctx.effect` 时的降级行为。
- 校验默认配置、局部覆盖、未知键拒绝、非法数字拒绝、路径逃逸拒绝。

## 4. 安装链

### 4.1 本地安装

```powershell
dsh plugin --profile web add link:"<dsh-workspace>\.dsh\plugins\ml-phase-gate"
```

### 4.2 验证

```powershell
dsh --profile web --dump-config
```

验证点：

- `~\.dsh\profiles\web\package.json` 的 `dependencies` 包含本包。
- `dsh.profile.bundles` 包含本包。
- `node_modules` 存在链接。
- `--dump-config` 中出现 `id: ml-phase-gate`。

### 4.3 卸载验证

```powershell
dsh plugin --profile web remove dsh-plugin-ml-phase-gate
```

验证点：

- `dependencies` 中不再包含本包。
- `dsh.profile.bundles` 中不再包含本包。
- `--dump-config` 中不再出现 `id: ml-phase-gate`。
- DSH profile 仍能组合。

### 4.4 再安装

卸载验证完成后重新安装，保持后续 P2 开发可用。

## 5. 风险

| 风险 | 处置 |
|---|---|
| 安装会修改真实 web profile | 安装前备份 `package.json` 与 `cordis.patch.yml` |
| `link:` 源目录不能移动或改名 | 文档明确记录 |
| `dsh plugin` 会写 profile lock 文件 | 需要用户批准的受控写入 |
| P1 未注册业务资源 | 这是有意设计，不是缺失 |
| P1 未提供客户端半 | P6 才引入客户端 bundle |
| fallback 不是真实生命周期 | 标记 test-only；P2 挂真实资源前必须硬化或移除 |
| P1 未引入 `Config` schema | 第三方先例证明非必需；P2 再决定是否引入 |

## 6. P1 完成定义

- 20 项本地测试通过。
- `node --check` 通过。
- 真实 profile 安装成功。
- `--dump-config` 出现插件条目。
- 卸载后插件条目消失且 profile 仍可组合。
- 最终重新安装，供 P2 使用。
- Claude Code 对抗评审完成，P1 blocker 闭合。


