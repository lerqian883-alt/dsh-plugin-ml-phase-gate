# P3 对抗式评审（只读）

已完整读取全部 14 份指定文件。以下按 10 个证伪方向逐一核验后给出结论。

## 结论

**有条件通过** —— 证据语义核心（fail-closed、退出码映射、`NNN-` 前缀、工件判定、gate blocker、连续证据前缀）成立且未越界进入 P4/P5/P6，但 `.cmd` 调用构造在含空格路径下会断裂、硬超时存在无限挂起路径、且多项冻结不变量（skip 拦截、基础设施错误不静默、输出截断）没有任何测试，须闭合后才能声明 P3 完成。

## 发现

**F1（高）`.cmd/.bat` 调用缺少整体外层引号，项目根含空格时 verify 永远无法执行**
- 证据：`lib/evidence/runner.js:64-70` 构造 `args: ['/d','/s','/c', '"${verifyPath}" -Only ${filter}']` + `windowsVerbatimArguments: true`（`lib/evidence/process.js:50` 不加引号直接拼接）。按 `cmd /?` 的引号规则：因为传了 `/s`，规则 1（保留引号）被禁用，走规则 2——剥掉首字符引号和**整行最后一个引号**。生效命令变成未加引号的 `<path> -Only 010-`。路径含空格（如 `<user-home>\proj\work\verify.cmd`）时 cmd 尝试执行 `<user-home>`，退出码 9009 → `status=error` → 恒定 blocker。测试没暴露它是因为 `test/p3-evidence.test.mjs:11-12` 的 `mkdtemp` 临时目录恰好无空格——这是被测试环境掩盖的潜伏缺陷。反讽点：去掉 `/s` 时规则 1 反而常能保留引号；`/s` 在此构造下是有害的。
- 原因：只给路径加了引号，没有按 cross-spawn 的规范形式把整个 `/c` 尾串再包一层外引号。
- 最小修复：`/c` 载荷改为 `""${verifyPath}" -Only ${filter}"`（双重外引号，cross-spawn 同款），并补一个项目根含空格的测试。顺带说明：即使修复，行内 `%VAR%` 仍会被 cmd 展开——路径内容是项目/配置侧权威，等同 shell 工具，可接受。
- 分类：**P3 必须修**。fail-closed（报 error 不报 pass），但主平台常见环境下核心功能不可用且报错误导。

**F2（中高）硬超时不保证有界返回，存在两条无限挂起路径**
- 证据一：`lib/evidence/process.js:19-21` 只在 `killer.on('error')`（taskkill **spawn 失败**）时回退 `child.kill()`；taskkill 正常运行但以非零退出码失败（如权限拒绝）时无任何回退，子进程不死，`close` 不触发，Promise 永不 resolve。`docs/P3-IMPLEMENTATION-LOGIC.md:44` 声称“失败回退 `child.kill()`”，与实现不符（文档-实现偏差）。
- 证据二：`process.js:80` 以 `close`（stdio 全部关闭）为解决点。检查脚本遗留持有 stdout/stderr 管道句柄的孤儿进程（如 `start /b` 派生、中间父进程已退出导致脱离 PID 树，`taskkill /T` 按 PID 树枚举不到它）时，即使主进程被杀甚至正常退出，`close` 也永不触发——**非超时的成功路径同样可能挂起**。
- 原因：以 `close` 为唯一解决点 + 回退只覆盖 taskkill 的 spawn error。
- 最小修复：监听 killer 的 `close`，非零即补 `child.kill()`；超时杀树后加宽限计时器兜底 resolve 并 `child.stdout/stderr.destroy()`（或改以 `exit` 事件解决并显式销毁流）。
- 分类：**P3 必须修**（“超时必须明确、不能挂起”是 P3 冻结不变量，直接命中评审问题 2）。

**F3（中）关键不变量测试缺口，接近只测 happy path**
- 证据：`test/p3-evidence.test.mjs` 中——
  - `skip`/`error` 状态从未进入 `evaluateStageExit` 断言（第 148-171 行只用了 fail/timeout）；契约 §2.6“skip 不等于 pass”这一冻结不变量**零测试**。
  - `runStageChecks` 的 catch 分支（`runner.js:130-142`，verify 命令缺失/前缀非法 → `status=error` 结果，承诺“基础设施错误不会静默丢弃”）零测试。
  - 输出截断零测试（`maxOutputBytes`、`...[truncated]...` 标记、有界性）。
  - 无路径含空格用例（会直接抓出 F1）；无 `010` vs `0100` 区分用例（合成 gate 没有 0100 分支，`test/p3-evidence.test.mjs:19-26`）；无首阶段即失败 → `evidenced=null` 的 `runEvidencePrefix` 用例；“硬超时和进程树终止”只断言了 `timedOut===true`，未断言树真被杀/时长有界。
- 原因：合成 gate 只覆盖主路径；真实 `verify.ps1` 的 `StartsWith` 语义不在本仓，`-Only` 行为仅靠文档声明。
- 最小修复：补 skip→blocker、verify 缺失→error、截断标记、含空格路径、`evidenced=null` 五类用例。
- 分类：**P3 必须修**。另注：本次为只读评审、我未执行测试，“55 项全过”系文档声明，未经我复核。

**F4（中低）verify.ps1 内部超时（124）的语义漂移与文档自相矛盾**
- 证据：`docs/P3-IMPLEMENTATION-LOGIC.md:29` 说 `124=TIMEOUT`；`docs/P3-ACCEPTANCE.md:70` 说“内部 timeout 会被其自身映射为最终 FAIL”；而 `runner.js:18-24` 把 124 映射为 `error`。三处互不一致。
- 原因：插件只认自身硬超时为 `timeout`，外部 124 落入“其他=error”（符合契约表字面），但真实内部超时会显示为泛化 error，诊断误导。
- 最小修复：先统一两份文档的事实描述；若要把 124 映射为 `timeout`，属判定语义变化，须按 CONTRACTS §5 附带裁决与测试，不得顺手改。
- 分类：后续风险。

**F5（低）POSIX 无进程组树杀**
- 证据：`process.js:24` 仅 `child.kill('SIGKILL')` 直杀。孙进程（如 `sleep 2`，测试第 36 行）存活并持有管道时，`close` 延迟到孙进程退出才触发——测试“通过”实则等了 2 秒；长命孙进程则无限挂起。另：POSIX 下默认 `work/verify.cmd` 直接 spawn 会 ENOEXEC → error（fail-closed 但不可用）。
- 最小修复：POSIX 分支 `detached: true` + `process.kill(-pid, 'SIGKILL')`。
- 分类：后续风险（主平台 Windows 已有 taskkill /T 主路径；但与 F2 同根，修 F2 时宜一并处理）。

**F6（低）`checkTimeoutMs=0` 完全禁用超时**
- 证据：`lib/config.js:115` 允许非负整数含 0；`process.js:68` 仅 `timeoutMs > 0` 才建计时器。挂起检查可无限执行。
- 最小修复：文档言明 0=不限，或设下限。
- 分类：后续风险。

**F7（低）文档精度：“默认 64 KiB”实为每流 64 KiB**
- 证据：`process.js:7,59-66` 对 stdout、stderr 各自施加 64 KiB 上限 → 单个 CheckResult 最大 ~128 KiB + 标记；`evidenceSnapshot` 逐检查累积。契约要求“具体上限由 P3 冻结”，冻结值与文档表述不一致。
- 最小修复：文档改为“每流 64 KiB”，P4 冻结快照/展示预算时按此计算。
- 分类：后续风险。

**F8（低）空检查 + 空工件的阶段无条件通过**
- 证据：`gate.js:16-46`，`checks=[]` 且 `artifacts=[]` → blockers 为空 → `passed=true`。CONTRACTS §2.4 只要求 `exit.checks` 是数组，未要求非空。
- 最小修复：在 P2 schema 或文档裁决是否允许“无出口判据”的阶段。
- 分类：后续风险（策略口子，非 P3 代码缺陷）。

**F9（低）契约 §2.6 与实现的字面差异 + 真实项目验证未闭环**
- 证据：CONTRACTS.md §2.6 写“执行 `work/verify.cmd -Only <prefix>`”，实现传 `<prefix>-`（`runner.js:62`）。§2.4 的“按 `NNN-` 整段匹配”支持实现意图，字面读法有歧义。且 §2.6 自己要求“P3 必须在真实项目上验证 `-Only`”——当前只有合成 gate 验证，`pm-valve-seat-qc` 不在本仓。
- 最小修复：§2.6 措辞改为 `-Only <NNN->`；在真实 verify.cmd 上补一次验证记录。
- 分类：后续风险。

## P3 必须修

1. **F1**：`cmd.exe /d /s /c` 载荷补整体外层引号（`""path" -Only NNN-"`），并加含空格项目根的测试；否则含空格路径下 verify 恒不可执行。
2. **F2**：闭合超时有界性——taskkill 非零退出码时补 `child.kill()`；孤儿管道持有者场景加宽限兜底 resolve + 流销毁（或改以 `exit` 解决）。当前实现与文档“失败回退”声明不符且存在永久挂起路径。
3. **F3**：补关键不变量测试——`skip`/`error` 进 gate 必为 blocker、verify 命令缺失生成 error CheckResult 而非静默、截断标记有界且仅真截断时出现、首阶段失败时 `evidenced=null`。

## 后续风险

1. **F4**：verify.ps1 内部超时 124 的三处描述互相矛盾；真实语义需在真实项目上核实并统一文档（映射改动需走契约裁决）。
2. **F5**：POSIX 无进程组树杀 + 默认 `verify.cmd` 在 POSIX 直接 spawn 会 ENOEXEC；长命孙进程可延迟/阻塞 `close`。
3. **F6**：`checkTimeoutMs=0` 等于无超时，配置层未设下限。
4. **F7**：64 KiB 上限是“每流”而非“每结果”，快照累积预算需 P4 前澄清。
5. **F8**：无检查无工件的阶段自动通过，策略口子留给 P2/文档裁决。
6. **F9**：CONTRACTS §2.6 的 `-Only <prefix>` 字面与实现 `-Only NNN-` 有歧义；真实 verify.cmd 上的 `-Only` 验证仍未闭环（契约 §2.6 明文要求）。

## 误报

1. **“子进程命令可被注入”**：prefix 严格 `/^\d{3}$/u`（`runner.js:37`），纯数字无法携带任何 shell 元字符；`verifyCommand` 经 `requireSafeRelativePath`（拒绝绝对/`..`/`.`/NUL/盘符/UNC，`config.js:44-62`）+ `isPathInside`（realpath 后比较，防符号链接逃逸，`project-root.js:69-84`）双重校验，且必须是已存在文件；`verifyCommand` 来自主机配置而非模型输入，执行权威等同 shell 工具（CONTRACTS §2.3/§2.10）。不构成模型驱动的注入。（路径含 `"`/`&`/`%` 时引号确实脆弱，由 F1 的修复顺带加固。）
2. **“skip/timeout/error 可能被当 pass”**：`mapExitCodeToStatus` 先判 `timedOut`（`runner.js:18-19`），gate 对一切非 `pass` 生成 blocker（`gate.js:19`），timeout 单独映射 `E_CHECK_TIMEOUT`。语义正确，仅缺测试（见 F3）。
3. **“`NNN-` 仍会误匹配 `0100`”**：`0100-x.ps1`.startsWith(`010-`) 为假，后缀破折号方案在 StartsWith 语义下成立；合成 gate 断言了 `%2=="010-"` 确实到达命令。
4. **“输出截断可能误导/无界”**：`append`（`process.js:53-57`）按字节硬截到上限，标记 `...[truncated]...` 仅在 `stdoutBytes > buffer.length` 即真截断时追加，恰好等于上限时不误标。唯一瑕疵是字节边界切断多字节字符产生 U+FFFD，属可接受失真。
5. **“P3 越界或破坏 P0/P1/P2/安装链”**：`lib/evidence/*` 为纯库层，无工具注册、无投影/快照写入、无 UI；常量全部从 `lib/contracts.js` 导入、未重声明；CheckResult/Blocker 形状与 §2.6/§2.7 一致（含 artifact blocker 的 `check` 填路径）；`package.json` 仅改描述、加 `test:p3`、更新全量脚本，`main`/`exports`/`files`/`dsh.bundle.patch` 未动、零新依赖；`evidenced` 仅内存返回未落盘。未发现越界或破坏。
