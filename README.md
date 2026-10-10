# dsh-plugin-ml-phase-gate

[![CI](https://github.com/lerqian883-alt/dsh-plugin-ml-phase-gate/actions/workflows/ci.yml/badge.svg)](https://github.com/lerqian883-alt/dsh-plugin-ml-phase-gate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 给 DeepSeek Harness 使用的机器学习阶段闸门插件：让“做到哪一步”不只靠模型自述，而是由检查、工件和项目状态共同证明。

## 这个插件解决什么问题

机器学习项目很容易出现一种情况：对话里说“已经完成数据处理”，但数据集切分、泄漏检查、指标文件或验证脚本并没有真正留下证据。

这个插件把 ML 项目拆成 M0–M8 阶段，并做三件事：

1. 读取项目当前声明的阶段；
2. 执行项目自己的验证脚本和检查；
3. 根据证据计算真实阶段、差距和下一出口。

结果会显示在 DSH 界面里：

```text
M0 ✓  M1 ✓  M2 ⚠  M3 ··· M8
声明 M2   证据 M1   差距 1   下一步 M2
```

插件不会替你编写 ML 项目代码，也不会凭空判断阶段完成。真正的判断依据来自：

```text
.dsh-ml-phase/phases.yml
.dsh-ml-phase/state.json
work/verify.cmd / verify.ps1 / verify.mjs / verify.sh
work/checks/*
outputs/*
```

## 你需要准备什么

- Node.js 20 或更高版本
- 可以运行的 DSH profile，下面以 `web` 为例
- 一个想要接入阶段流程的 ML 项目目录
- 项目自己的验证脚本和检查脚本

Windows、macOS 和 Linux 都可以使用。

---

# 下载与安装

## 方式一：从 GitHub 源码安装（推荐用于当前阶段）

先下载源码：

```powershell
git clone https://github.com/lerqian883-alt/dsh-plugin-ml-phase-gate.git
cd dsh-plugin-ml-phase-gate
```

然后把它链接到 DSH：

```powershell
dsh plugin --profile web add link:"$PWD"
```

如果 PowerShell 对 `$PWD` 处理不符合预期，可以显式取当前目录：

```powershell
$pluginPath = (Get-Location).Path
dsh plugin --profile web add link:"$pluginPath"
```

macOS 或 Linux 可以直接使用：

```bash
dsh plugin --profile web add link:"$PWD"
```

安装后确认 DSH 能看到插件：

```powershell
dsh --profile web --dump-config
```

预期看到类似内容：

```yaml
- id: ml-phase-gate
  name: dsh-plugin-ml-phase-gate
  config:
    activationMode: auto
```

## 方式二：从 GitHub Release 安装

项目发布 Release 后，可以下载：

```text
dsh-plugin-ml-phase-gate-<version>.tgz
dsh-plugin-ml-phase-gate-<version>.tgz.sha256
```

先校验文件：

```powershell
Get-FileHash .\dsh-plugin-ml-phase-gate-0.1.0.tgz -Algorithm SHA256
Get-Content .\dsh-plugin-ml-phase-gate-0.1.0.tgz.sha256
```

再确认当前 DSH 支持的安装规格：

```powershell
dsh plugin --help
```

如果你的 DSH 版本支持 file/npm 包规格，就使用对应命令安装 tarball。不同 DSH 版本的安装语法可能不同，不要直接照搬其他版本的参数。

## 方式三：以后发布到 npm 后安装

如果未来发布到 npm，用户应优先使用：

```powershell
dsh plugin --profile web add dsh-plugin-ml-phase-gate
```

在此之前，以 GitHub 源码安装和 Release tarball 安装为准。

## 卸载

```powershell
dsh plugin --profile web remove dsh-plugin-ml-phase-gate
```

---

# 初始化一个 ML 项目

插件安装成功后，还需要给 ML 项目创建阶段文件和验证入口。

## 推荐方式：使用 bootstrap

在插件仓库中执行：

```powershell
$projectRoot = "D:\ML\my-project"

node scripts/bootstrap-project.mjs `
  --root $projectRoot `
  --template standard
```

也可以先进入目标项目，再省略 `--root`：

```powershell
cd D:\ML\my-project
node C:\path\to\dsh-plugin-ml-phase-gate\scripts\bootstrap-project.mjs `
  --template standard
```

bootstrap 会在目标项目根目录下创建：

```text
.dsh-ml-phase/
  phases.yml
  state.json
work/
  verify.*
  checks/
outputs/
```

可用参数：

```text
--root <project>            指定 ML 项目根目录
--platform auto|windows|posix
--template standard|node
--force                     覆盖管理路径中的冲突文件
--dry-run                   只显示计划，不写文件
```

生成的检查脚本是占位检查，默认不会伪造通过。你需要把它们替换成真正能证明阶段完成的检查。

## 手动创建最小结构

如果你不想使用 bootstrap，可以手动创建：

```text
my-ml-project/
  .dsh-ml-phase/
    phases.yml
    state.json
  work/
    verify.cmd
    checks/
      010-problem.ps1
      011-data.ps1
  outputs/
```

最小 `state.json`：

```json
{
  "version": 1,
  "declared": "M0",
  "history": []
}
```

## 验证入口如何选择

插件支持以下入口，未显式配置时按顺序自动发现：

```text
work/verify.cmd
work/verify.ps1
work/verify.mjs
work/verify.sh
```

检查前缀通过参数传入：

```text
verify.* -Only 010-
```

退出码约定：

```text
0 = pass
1 = fail
2 = skip
其他 = error
```

Node 项目的验证入口可以写成：

```js
const prefix = process.argv[process.argv.indexOf('-Only') + 1];
if (prefix !== '010-') process.exit(1);
// 在这里执行真实检查
process.exit(0);
```

---

# 启动 DSH

进入已经初始化过的 ML 项目：

```powershell
cd D:\ML\my-project
```

启动 DSH：

```powershell
dsh --profile web
```

或者只启动服务，不自动打开浏览器：

```powershell
dsh --profile web --no-open --port 10045
```

插件会根据当前 session 的 cwd 向上寻找项目根，并读取：

```text
.dsh-ml-phase/state.json
```

如果找不到项目状态，`activationMode=auto` 下不会显示阶段 Dock。

---

# 你会看到什么

## 输入框上方的阶段轨道

```text
M0 ✓  M1 ✓  M2 ⚠  M3 ○  M4 ○ ...
```

轨道会显示：

- 当前声明阶段
- 已经由证据证明的阶段
- 两者之间的差距
- 下一步应该进入哪个阶段
- 数据是否可能过期

点击“展开阶段详情”可以看到下一阶段的检查、工件和常见坑。

## 右栏审计页

点击“打开审计”后，可以看到完整的：

- 当前状态摘要
- 下一出口
- M0–M8 阶段清单
- 历史迁移记录

---

# 常用工具

在 DSH 中可以让 Agent 使用：

```text
ml_phase_status
```

查看当前声明、证据、差距和下一阶段。

```text
ml_phase_phases
```

查看阶段定义和证据判定结果。

```text
ml_phase_advance
```

在目标阶段检查和工件通过后推进阶段。

```text
ml_phase_defer
```

记录人工覆盖原因，例如：

```text
ml_phase_defer reason="等待外部数据确认"
```

---

# 配置

默认配置：

```yaml
- id: ml-phase-gate
  name: dsh-plugin-ml-phase-gate
  config:
    activationMode: auto
    watchAutoRun: false
```

## activationMode

| 模式 | 行为 |
|---|---|
| `auto` | 有阶段快照时显示；非 ML 项目安静降级 |
| `always` | 没有阶段快照时也显示“未开始” |
| `off` | Host 不注册能力，Dock/Audit 不显示 ML 内容 |

## watchAutoRun

默认：

```yaml
watchAutoRun: false
```

含义是文件变化只标记数据可能过期，不会自动执行项目验证脚本。

只有显式打开后，才会在文件变化时自动运行检查：

```yaml
watchAutoRun: true
```

这会启动真实子进程。除非你明确知道项目脚本的行为，否则建议保持关闭。

---

# 项目结构说明

```text
.dsh-ml-phase/
  phases.yml      阶段定义和退出条件
  state.json      当前声明阶段和迁移历史

work/
  verify.*        项目统一的验证入口
  checks/         阶段检查脚本

outputs/          阶段产物，例如报告、指标和数据摘要
```

## phases.yml

`phases.yml` 定义阶段名称、检查前缀、工件和常见坑。

项目可以覆盖默认阶段，也可以追加自己的阶段。

## state.json

`state.json` 保存声明阶段和历史记录。

不要在状态文件里写入：

```text
evidenced
gap
next
```

这些字段由插件根据证据实时计算。

---

# 示例项目

仓库自带两个示例：

```text
examples/minimal-ml-project/    Windows cmd/ps1 示例
examples/node-ml-project/      跨平台 Node 示例
```

Node 示例可以直接验证：

```powershell
cd examples\node-ml-project
node work\verify.mjs -Only 010-
```

---

# 常见问题

## 安装了插件，但看不到 ML 阶段 Dock

按顺序检查：

1. 当前 DSH session 是否在 ML 项目目录下启动。
2. 项目是否有 `.dsh-ml-phase/state.json`。
3. 当前配置是否为 `activationMode: auto`，并且已经有阶段快照。
4. 如果是空项目，可以先用 `activationMode: always` 观察“未开始”轨道。

## 提示找不到 verify command

插件会尝试：

```text
work/verify.cmd
work/verify.ps1
work/verify.mjs
work/verify.sh
```

至少创建其中一个，或者显式配置：

```yaml
verifyCommand: work/verify.mjs
```

## 阶段检查一直失败

检查脚本需要返回正确退出码：

```text
0 = pass
1 = fail
2 = skip
其他 = error
```

也可以先运行：

```text
ml_phase_status
```

查看具体 blocker 和原始输出。

## 不想自动执行项目脚本

保持默认：

```yaml
watchAutoRun: false
```

需要完全停用运行时能力时，使用：

```yaml
activationMode: off
```

需要彻底移除静态浏览器 bundle 时，在 DSH 插件管理器中禁用插件。

---

# 开发与验证

```powershell
npm test
npm run pack:check
node scripts/smoke-install.mjs
npm run release:pack
npm run smoke:package
```

## 打包发布

```powershell
npm run release:pack
```

会生成：

```text
dsh-plugin-ml-phase-gate-<version>.tgz
dsh-plugin-ml-phase-gate-<version>.tgz.sha256
```

---

# 文档

- [架构与契约](docs/ARCHITECTURE.md)
- [冻结契约](docs/CONTRACTS.md)
- [实现逻辑](docs/IMPLEMENTATION-LOGIC.md)
- [P8 激活策略](docs/P8-IMPLEMENTATION-LOGIC.md)
- [P9 发布与可插拔性](docs/P9-IMPLEMENTATION-LOGIC.md)
- [P9 验收记录](docs/P9-ACCEPTANCE.md)
- [贡献指南](CONTRIBUTING.md)
- [安全说明](SECURITY.md)
