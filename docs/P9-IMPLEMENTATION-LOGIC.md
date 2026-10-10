# P9 GitHub 分发与跨平台可插拔性

> 状态：实现完成，已验证本地打包、bootstrap 和跨平台 Node verify。
> 目标：让插件从 GitHub 下载后，不依赖作者本机绝对路径，可以在 Windows 和 POSIX 环境完成安装、项目初始化、验证和启动。
> 原则：Host 是配置源；`activationMode` 和 `watchAutoRun` 语义不变；公开包不包含本机路径或秘密。

## 1. 交付范围

P9 包含：

1. 发布用 `package.json` 元数据和 `files` 白名单。
2. 跨平台 `work/verify.*` 自动发现。
3. `scripts/bootstrap-project.mjs` 项目初始化器。
4. `examples/minimal-ml-project` 和 Node 跨平台示例。
5. 包内容检查、干净目录 smoke test。
6. GitHub Actions CI。
7. `LICENSE`、`CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`、`.gitignore`。
8. release tarball 生成与 SHA256 流程。
9. README 对外安装和初始化流程。

不包含：

- 自动创建 GitHub 远端仓库；
- 自动 push；
- 自动发布 npm；
- 自动安装 DSH 插件到用户 profile；
- 绕过 DSH 插件安装授权。

## 2. 验证入口冻结

保留现有配置 `verifyCommand` 作为显式 override。

新增默认候选：

```js
VERIFY_CANDIDATES = [
  'work/verify.cmd',
  'work/verify.ps1',
  'work/verify.mjs',
  'work/verify.sh',
]
```

解析顺序：

1. `verifyCommand` 非空：只使用显式路径。
2. 未配置时：按候选顺序找到第一个存在的文件。
3. 都找不到：`E_UNKNOWN_CHECK`，报告所有候选路径。

执行方式：

```text
.cmd/.bat -> Windows cmd.exe /d /s /c
.ps1      -> Windows powershell.exe -NoProfile -ExecutionPolicy Bypass
.mjs      -> node
.sh       -> POSIX sh
其他可执行文件 -> 直接执行
```

参数继续传递：

```text
-Only NNN-
```

`verifyCommand` 从“默认值 work/verify.cmd”改为“可选显式 override”；默认候选由 `VERIFY_CANDIDATES` 提供。`DEFAULT_CONFIG.verifyCommand` 改为 `null`，`normalizeConfig` 接受字符串或 `null`。

## 3. 项目初始化器冻结

命令：

```powershell
node scripts/bootstrap-project.mjs --root <project>
```

支持参数：

```text
--root <path>
--platform auto|windows|posix
--template standard|node
--force
--dry-run
```

行为：

- 默认幂等，不覆盖已有文件。
- `--force` 会在 bootstrap 管理路径上覆盖冲突文件，使用前应确认没有手工修改需要保留。
- 创建 `.dsh-ml-phase/phases.yml` 和 `state.json`。
- 创建 `work/checks`、`outputs`。
- Windows 模板生成 `work/verify.cmd` 和 `work/verify.ps1`。
- POSIX 模板生成 `work/verify.sh`。
- Node 模板生成 `work/verify.mjs`。
- `--dry-run` 只输出计划，不写文件。
- 输出 created/skipped/overwritten 清单。
- 不运行 verify。

## 4. 示例项目冻结

提供：

```text
examples/minimal-ml-project/
  .dsh-ml-phase/phases.yml
  .dsh-ml-phase/state.json
  work/verify.cmd
  work/verify.ps1
  work/checks/010-problem.ps1
  work/checks/011-data.ps1
  outputs/README.md

examples/node-ml-project/
  .dsh-ml-phase/phases.yml
  .dsh-ml-phase/state.json
  work/verify.mjs
  work/checks/010-problem.mjs
  work/checks/011-data.mjs
  outputs/README.md
```

Node 示例作为跨平台实际验证路径。

## 5. 发布包冻结

`package.json`：

- `version` 提升到 `0.1.1`。
- `private` 改为 `false`。
- 增加 `license`、`engines`、`scripts`、`files`。
- 不写伪造 GitHub owner；repository 可由发布者在创建仓库后填写。
- `files` 包含 `lib`、`docs`、`scripts`、`examples`、配置、README、LICENSE。

脚本：

```text
bootstrap
smoke
pack:check
test
```

## 6. CI 冻结

GitHub Actions 矩阵：

```text
windows-latest
ubuntu-latest
```

执行：

```text
npm ci
npm test
npm run pack:check
node scripts/smoke-install.mjs
npm pack --dry-run
npm run release:pack
npm run smoke:package
```

检查：

- 测试通过；
- tarball 文件白名单正确；
- 源码不包含作者绝对路径；
- bootstrap 能创建项目；
- Node verify 示例能通过；
- `activationMode=off` 不运行 watcher。

## 7. 安全边界

- `work/verify.*` 和 `work/checks/*` 属于用户项目代码。
- 插件执行项目脚本的授权边界等同 shell 执行。
- 默认 `watchAutoRun=false`。
- README 和 SECURITY 明确警告项目脚本执行风险。
- 仓库扫描 token、cookie、API key、本机路径。
- `.gitignore` 排除 node_modules、coverage、临时目录和日志。

## 8. 验收

- 本地全量测试通过。
- Windows 真实目录全量测试通过。
- `npm pack --dry-run` 不含本机绝对路径。
- tarball 可在临时目录解包。
- bootstrap 的 dry-run 和真实创建都通过。
- Node 示例通过 `work/verify.mjs`。
- Windows cmd/ps1 路径继续通过。
- 真实 DSH 插件目录同步并回归。
