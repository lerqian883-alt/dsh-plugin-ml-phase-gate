# P3 证据系统与闸门验收

> P3 范围：执行 `work/verify.cmd -Only NNN-`、生成 CheckResult、检查工件、阶段 gate、证据前缀。
> 不包含：P4 工具面、P5 投影、P6 客户端 UI、L4 产物印记。

## 1. P3 任务清单

| 编号 | 任务 | 交付物 | 状态 |
|---|---|---|---|
| P3.1 | 实现有界进程执行与硬超时 | `lib/evidence/process.js` | 完成 |
| P3.2 | 实现阶段检查 runner | `lib/evidence/runner.js` | 完成 |
| P3.3 | 实现工件检查 | `lib/evidence/artifacts.js` | 完成 |
| P3.4 | 实现阶段闸门与证据前缀 | `lib/evidence/gate.js` | 完成 |
| P3.5 | 建立 P3 测试 | `test/p3-evidence.test.mjs` | 完成 |
| P3.6 | Claude Code 对抗评审 | `docs/P3-ADVERSARIAL-REVIEW.md` | 完成 |

## 2. 本地验收

P3 需要真实派生 `verify.cmd`、`cmd.exe`、`taskkill` 和 node 子进程，因此测试必须在允许进程派生的受控环境中运行：

```powershell
node --test test/p0-contracts.test.mjs test/p1-skeleton.test.mjs test/p2-yaml.test.mjs test/p2-phases.test.mjs test/p2-project-root.test.mjs test/p2-state.test.mjs test/p3-evidence.test.mjs
```

结果：

```text
tests 62
pass 62
fail 0
```

P3 测试覆盖：

- stdout/stderr/exitCode 捕获
- 硬超时和进程树终止
- `0=pass`、`1=fail`、`2=skip`、其他=error
- `NNN-` 前缀传入 verify.cmd
- 超时 => gate 不通过
- artifact 缺失、空文件、非空文件、目录
- check + artifact blocker
- 首个失败阶段停止
- `evidenced` 连续前缀

## 3. 关键实现裁决

1. runner 传入 `-Only ${prefix}-`，避免 `010` 误匹配 `0100-*`。
2. `.cmd/.bat` 通过 `cmd.exe /d /s /c` + `windowsVerbatimArguments: true` 执行，避免 Node 二次转义。
3. 输出默认截断到 64 KiB。
4. 超时后 Windows 使用 `taskkill /T /F`，失败回退 `child.kill()`。
5. `skip`、`timeout`、`error` 都不是 pass。
6. 空文件、空目录都不是有效工件。
7. `runEvidencePrefix` 在首个失败阶段停止，不继续声称后续证据。

## 4. P1 安装链回归

P3 未新增依赖，未修改 `main` / `exports` / `dsh.bundle.patch`。`package.json` 仅：

- 更新描述为 P3。
- 增加 `test:p3`。
- 更新全量测试脚本。

最终同步后使用 `dsh --profile web --dump-config` 复验插件仍在组合树中。

## 5. 边界

- P3 是库级证据层，尚未接入工具面。
- `runEvidencePrefix` 会顺序执行检查；最坏延迟仍由 P4/P5 的节流设计约束。
- 检查的 stdout/stderr 已截断，但 P4 仍需决定工具卡如何展示。
- 当前 verify.ps1 内部 timeout 会被其自身映射为最终 FAIL；插件的硬超时是另一层保护。
- 真实项目首先需要 `work/verify.cmd -Only NNN-` 可运行。

## 6. P3 退出条件

- 62 项 P0–P3 测试通过。
- 真实子进程、退出码、超时和 gate 行为有测试。
- P3 未越界进入 P4/P5/P6。
- P1 安装链保持。
- Claude Code 对抗评审完成，P3 blocker 闭合。


