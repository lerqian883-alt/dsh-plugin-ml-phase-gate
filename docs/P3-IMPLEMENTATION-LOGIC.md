# P3 实现逻辑：证据系统与闸门

> 状态：P3 实现逻辑文档。
> 目标：把 `work/checks/*.ps1` 变成可执行证据，并将阶段出口判定为 PASS/FAIL。
> 不包含：P4 工具面、P5 投影、P6 客户端 UI、L4 产物印记。

## 1. 代码模块

| 模块 | 文件 | 职责 |
|---|---|---|
| 进程执行 | `lib/evidence/process.js` | 派生进程、超时、输出截断 |
| 检查 runner | `lib/evidence/runner.js` | 调用 `verify.cmd -Only NNN-`，生成 CheckResult |
| 工件检查 | `lib/evidence/artifacts.js` | 工件存在、非空、文件/目录 |
| 闸门 | `lib/evidence/gate.js` | 阶段出口判定、证据前缀 |
| 出口 | `lib/evidence/index.js` | P3 公共 API |

## 2. 文档优先检索记录

实现前读取：

- `docs/CONTRACTS.md` §2.6/§2.7：CheckResult、检查执行边界、Blocker。
- `pm-valve-seat-qc/work/verify.ps1`：`-Only`、退出码、内部 timeout 的实现。
- `pm-valve-seat-qc/work/verify.cmd`：`powershell.exe -ExecutionPolicy Bypass` 包装。
- `pm-valve-seat-qc/work/README.md`：变异测试与 PowerShell 5.1 约束。
- P2 `lib/phases/schema.js`：检查前缀 `NNN` 与唯一绑定规则。

关键事实：

1. `verify.ps1` 退出码：`0=PASS`、`1=FAIL`、`2=SKIP`、`124=TIMEOUT`。
2. `verify.cmd` 把参数转交 `verify.ps1`。
3. `verify.ps1 -Only` 用 `StartsWith` 过滤文件名。
4. 因此 P3 runner 传入 `${prefix}-`，确保 `010` 不会误匹配 `0100-*`。
5. 检查脚本本身必须纯 ASCII；插件保留原始输出但必须截断。

## 3. 进程执行逻辑

`runProcess(command, args, options)`：

- 使用 `spawn`，`shell=false`。
- 对 `.cmd/.bat` 使用 `cmd.exe /d /s /c` 和 `windowsVerbatimArguments: true`，避免 Node 二次转义路径。
- 捕获 stdout/stderr。
- 输出有界：默认 64 KiB；超出时追加 `...[truncated]...`。
- 超时使用硬计时器；超时后杀进程树。
- Windows 使用 `taskkill /T /F`；失败回退 `child.kill()`。
- 返回 `{exitCode, stdout, stderr, durationMs, timedOut, command}`。

## 4. 检查 runner 逻辑

`buildVerifyInvocation(projectRoot, prefix, options)`：

1. 校验 prefix 为 `NNN`。
2. 校验 `verifyCommand` 为项目相对路径。
3. 解析到项目根内，拒绝逃逸。
4. 要求 verify 命令是已存在文件。
5. 构造 `-Only ${prefix}-` 参数。
6. `.cmd/.bat` 走 `cmd.exe`；`.ps1` 走 PowerShell Bypass；其他平台直接执行。

`runVerifyCheck(projectRoot, stageId, prefix, options)`：

- 调 `runProcess`。
- 映射状态：
  - timedOut => `timeout`
  - 0 => `pass`
  - 1 => `fail`
  - 2 => `skip`
  - 其他 => `error`
- 输出完整 CheckResult。

`runStageChecks`：

- 按 `stage.exit.checks` 顺序执行。
- 每个 prefix 一个 CheckResult。
- 单个检查基础设施错误不会静默丢弃；生成 `status=error` 的结果。

## 5. 工件检查逻辑

`checkArtifact(projectRoot, stageId, artifactPath)`：

1. 拒绝绝对路径、`..`、NUL。
2. 解析到项目根内。
3. 缺失 => `exists=false`。
4. 文件 => `kind=file`，`size=stat.size`。
5. 目录 => `kind=directory`，`size=readdir().length`。
6. 空文件或空目录 => 不通过。
7. 任意异常 => `exists=false` + error 说明。

## 6. 闸门逻辑

`evaluateStageExit({stage, checks, artifacts})`：

- 任意 check 不是 `pass` => Blocker。
- `timeout` => `E_CHECK_TIMEOUT`。
- 其他非 pass => `E_CHECK_FAILED`。
- 任意工件不存在或为空 => Blocker `E_ARTIFACT_MISSING`。
- 无 Blocker 才 `passed=true`。

`runStageEvidence`：

- `runStageChecks` + `checkArtifacts` + `evaluateStageExit`。
- 返回 `{stage, checks, artifacts, evaluation}`。

`runEvidencePrefix`：

- 按阶段顺序运行。
- 全部通过则继续。
- 第一个失败阶段停止。
- 返回 `{evidenced, stages, stoppedAt}`。
- `evidenced` 是连续通过前缀的最后一个阶段；没有通过阶段则为 `null`。

## 7. 安全边界

- 不执行任意模型提供的命令；只执行 `verifyCommand` 指向的项目文件。
- prefix 必须是 3 位数字，不能注入 shell 参数。
- verify 命令路径必须在项目根内。
- 执行项目脚本的授权边界等同 shell 工具。
- 输出截断，避免检查输出拖垮会话和状态存储。

## 8. 测试策略

- `runProcess`：stdout/stderr/exitCode/timeout。
- `runVerifyCheck`：pass/fail/skip/error/timeout。
- `runStageChecks`：per-prefix 结果。
- `checkArtifact`：缺失、空文件、非空文件、目录。
- `evaluateStageExit`：check 和 artifact blockers。
- `runStageEvidence`：组合结果。
- `runEvidencePrefix`：首个失败阶段停止。

P3 测试必须真实派生进程，因此需要在允许 `spawn` 的环境中运行。

## 9. P3 完成定义

- P0–P3 全量 62 项测试通过。
- 证据 runner 能真实调用 verify.cmd。
- 超时、错误、skip 不通过。
- 工件缺失/为空不通过。
- 证据前缀在首个失败阶段停止。
- Claude Code 对抗评审完成，P3 blocker 闭合。
- P1 安装链保持。


