# dsh-plugin-ml-phase-gate

DeepSeek Harness 的机器学习阶段闸门插件。它在 ML 项目中读取阶段定义和项目状态，运行项目自有证据检查，并在 DSH Dock 与右栏审计页中显示声明阶段、证据阶段、差距和下一出口。

## 身份

| 项目 | 值 |
|---|---|
| 显示名称 | ML 阶段闸门 / ML phase gate |
| 插件 ID | `ml-phase-gate` |
| npm 包名 | `dsh-plugin-ml-phase-gate` |
| 项目状态目录 | `.dsh-ml-phase` |
| 默认阶段 | M0–M8 |

## 能力

- `.dsh-ml-phase/phases.yml` 阶段定义。
- `.dsh-ml-phase/state.json` 审计状态。
- `work/verify.*` 项目验证入口。
- `work/checks/*` 阶段证据检查。
- `ml_phase_status`、`ml_phase_advance`、`ml_phase_defer`、`ml_phase_phases` 四个工具。
- `conversation.input.dock` 阶段轨道。
- `sidebar.right.pane.tab` 审计页。
- `activationMode=auto|always|off`。
- `watchAutoRun=false` 安全默认。

## 环境要求

- Node.js 20 或更高版本。
- 可运行的 DSH profile，当前文档以 `web` profile 为例。
- Windows、Linux 或 macOS。

## 安装插件

DSH 的插件安装规格取决于当前版本。先执行：

```powershell
dsh plugin --help
```

选择当前 DSH 实际支持的安装格式。

### GitHub Release tarball

如果当前 DSH 支持 file/npm 包规格：

```powershell
dsh plugin --profile web add <path-or-install-spec-to-tarball>
```

### GitHub 源码开发安装

```powershell
git clone https://github.com/lerqian883-alt/dsh-plugin-ml-phase-gate.git
cd dsh-plugin-ml-phase-gate
dsh plugin --profile web add link:"$PWD"
```

`link:` 适合开发和贡献，不适合作为最终用户唯一安装方式。

确认配置：

```powershell
dsh --profile web --dump-config
```

默认应显示：

```yaml
- id: ml-phase-gate
  name: dsh-plugin-ml-phase-gate
  config:
    activationMode: auto
```

## 初始化 ML 项目

在插件仓库中运行：

```powershell
node scripts/bootstrap-project.mjs --root C:\work\my-ml-project --template standard
```

跨平台 Node 验证模板：

```powershell
node scripts/bootstrap-project.mjs --root C:\work\my-ml-project --template node
```

参数：

```text
--root <project>
--platform auto|windows|posix
--template standard|node
--force
--dry-run
```

bootstrap 默认不覆盖已有文件。没有 `--force` 时，冲突文件会被跳过。

生成的项目结构：

```text
my-ml-project/
  .dsh-ml-phase/
    phases.yml
    state.json
  work/
    verify.cmd
    verify.ps1
    verify.mjs
    verify.sh
    checks/
  outputs/
```

具体生成哪些入口取决于 `--platform` 和 `--template`。生成的检查是占位检查，默认退出 1，避免脚手架自动伪造通过证据。

## 启动 DSH

```powershell
cd C:\work\my-ml-project
dsh --profile web
```

或：

```powershell
dsh --profile web --no-open --port 10045
```

当 session cwd 位于包含 `.dsh-ml-phase/state.json` 的项目中时，插件会自动播种 `mlPhase` projection，并显示阶段状态。

## 验证入口

`verifyCommand` 是可选显式 override。未配置时按以下顺序自动发现：

```text
work/verify.cmd
work/verify.ps1
work/verify.mjs
work/verify.sh
```

首次配置的默认值：

```yaml
verifyCommand: null
```

执行时传入：

```text
-Only NNN-
```

退出码：

```text
0 = pass
1 = fail
2 = skip
其他 = error
```

## 阶段推进

查看状态：

```text
ml_phase_status
```

列出阶段：

```text
ml_phase_phases
```

前向推进：

```text
ml_phase_advance
```

人工 defer：

```text
ml_phase_defer
```

只有目标阶段检查和 artifacts 满足条件时，`state.json` 才会写入。

## 激活策略

默认：

```yaml
activationMode: auto
```

| 模式 | Host | Client |
|---|---|---|
| `auto` | 注册工具、projection、pre-step、watcher，activation projection 为 `auto` | 有阶段快照时显示 Dock；无快照时静默 |
| `always` | 注册工具、projection、pre-step、watcher，activation projection 为 `always` | 无快照时显示“未开始” |
| `off` | 不注册工具、projection、pre-step、watcher，也不注册 activation projection | Dock/Audit 无可见 ML UI |

`off` 不动态卸载静态 `dsh.client` bundle。要彻底移除客户端注册，使用 DSH 插件管理器禁用插件。

## 安全边界

- `work/verify.*` 和 `work/checks/*` 是项目代码。
- 执行这些脚本的授权边界等同 shell 执行。
- `watchAutoRun` 默认关闭。
- 不要把 token、cookie、API key 或私钥写入 `.dsh-ml-phase/state.json`。
- CI、安装和自动检查必须遵守 DSH 的授权边界。

## 示例项目

```text
examples/minimal-ml-project/
examples/node-ml-project/
```

## 本地测试

```powershell
npm test
node scripts/check-package.mjs
node scripts/smoke-install.mjs
npm pack --dry-run
```

## 打包发布

```powershell
npm run release:pack
npm run smoke:package
```

`release:pack` 会生成 `dsh-plugin-ml-phase-gate-<version>.tgz` 和对应 `.sha256`。然后创建 GitHub Release，上传 tarball 和 SHA256。

## 文档

- `docs/CONTRACTS.md`
- `docs/ARCHITECTURE.md`
- `docs/P8-IMPLEMENTATION-LOGIC.md`
- `docs/P8-ACCEPTANCE.md`
- `docs/P9-IMPLEMENTATION-LOGIC.md`
- `docs/P9-ACCEPTANCE.md`
- `docs/P9-ADVERSARIAL-REVIEW.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
