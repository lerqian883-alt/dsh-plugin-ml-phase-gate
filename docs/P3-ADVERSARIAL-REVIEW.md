# P3 对抗式评审记录

> 评审工具：Claude Code CLI 2.1.289。
> 评审模式：只读、对抗式、尝试证伪。
> 原始输出：`docs/P3-ADVERSARIAL-REVIEW.raw.md`、`docs/P3-ADVERSARIAL-REVIEW.round2.raw.md`。
> 评审边界：只检查 P3，不进入 P4/P5/P6。

## 1. 首轮结论

**有条件通过**。

证据语义核心成立，但存在 3 个 P3 必修项和若干后续风险。

## 2. P3 必修项与处置

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P3-R01 | 高 | `.cmd/.bat` 的 `/c` 载荷只有内层路径引号，项目根含空格时 verify 无法执行 | 已改为 `cmd.exe /d /s /c` + 整体外层引号 + `windowsVerbatimArguments: true`，并补含空格路径测试 |
| P3-R02 | 中高 | 硬超时存在无限挂起路径：taskkill 非零退出码未回退，孤儿管道可能使 close 永不触发 | 已补 taskkill 非零回退 `child.kill()`、exit 250ms 兜底、timeout 1s 兜底和流销毁 |
| P3-R03 | 中 | 关键不变量测试缺口：skip/error gate、缺失 verify、输出截断、空格路径、首阶段失败 evidenced=null | 已补全部负向测试 |

## 3. 额外修复

- 空 checks + 空 artifacts 现在 fail closed，不再自动通过。
- `timeoutMs <= 0` 在 runner 中回退默认超时，不再等价无超时。
- exit 后 grace 兜底保留真实退出码。
- 补 Windows `.ps1` 分支测试。
- 测试清理加有界重试，消除 Windows EBUSY 假失败。

## 4. 第二轮结论

**通过**。

- 首轮 3 个 P3 必修项全部闭合。
- 未发现新的 P3 blocker。
- P3 未注册工具、投影、注入或客户端槽位。
- P0/P1/P2 契约和安装链未被破坏。

## 5. 仍保留的后续风险

- `cmd.exe` 载荷内 `%VAR%` 仍会被 cmd 展开，属 Windows shell 固有残余风险。
- POSIX 无进程组树杀；当前主平台为 Windows。
- `verify.ps1` 内部 timeout 124 最终被 verify.ps1 自己映射为 FAIL；插件硬超时是外层保护。
- 输出上限是每流 64 KiB，P4 需要据此设计快照预算。
- 真实 `pm-valve-seat-qc` 项目上的 `-Only` 验证仍需在实际项目运行时完成。
