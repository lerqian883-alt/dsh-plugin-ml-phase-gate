## 结论
通过——首轮三项必修项均已闭合:advance/defer 的读-改-写均在 `withProjectLock` 内(`lib/tools/advance.js:46`、`lib/tools/defer.js:45`),advance 在锁内重读 state 并对 declared 变化抛 `E_WRITE_CONFLICT`(`lib/tools/advance.js:47-50`);`docs/CONTRACTS.md:519-595` 已有“P4 契约修正”节,冻结 advance/phases/defer 输出形状与锁规则;锁冲突测试(`test/p4-tools.test.mjs:256`)与契约修正测试(`test/p4-tools.test.mjs:276`)均已补齐;四个工具仍经 `lib/index.js:52-54` 的 effect 内 `registerTools` 注册,projectRoot 仍强制等于会话派生根(`lib/tools/helpers.js:30-41`),advance 所有失败分支均在 `writeStateAtomic` 之前返回或抛出、noop 不写盘,未发现新 P4 blocker 或 P0-P3/P1 安装链破坏(`lib/contracts.js` 常量未动,p1/p2 测试面完好)。

## 仍存在的 P4 blocker
无。

## 后续风险
- declared 在锁等待期间变化的检测分支(`lib/tools/advance.js:48-50`)没有直接测试:现有锁冲突测试先持外部文件锁再调用 advance,触发的是锁获取时的 `E_WRITE_CONFLICT`,不是重读比较分支;建议 P5 前补一个“同进程持锁期间改 declared → advance 报冲突”的用例。
- defer 在释放锁之后才计算 evaluation(`lib/tools/defer.js:77-81`),返回的 evaluation 可能落后于解锁后被并发修改的 state;仅展示性,state 写入本身在锁内一致。
- advance 的 unknown-phase 失败分支(`lib/tools/advance.js:54`)缺少 `from` 字段,与 CONTRACTS.md 修正节的失败形状不完全一致;schema 未强制 `from`,非阻断。
- Windows 下 `writeStateAtomic` 的 rename 回退 copyFile 非原子(`lib/state/store.js:67-73`),不持锁的读者(status/phases)理论上可读到半写状态并误报 `E_STATE_CORRUPT`;P2 既有行为,非本轮引入。
- 崩溃残留的 `state.lock` 可能被随 `state.json` 一起提交入 git,建议文档层面提示 ignore。
- 本次复核为静态只读:Glob/Grep 因 `rg` EPERM 无法枚举目录,且未执行测试套件;结论基于对 `lib/index.js`、四个工具、helpers、lock、store、evaluate、CONTRACTS.md 及 p1/p2/p4 测试的逐文件阅读,`p0-contracts`、`p2-yaml`、`p2-phases`、`p2-project-root`、`p3-evidence` 未逐行复核。

## 误报
- 首轮“advance 失败路径会写 state”类担忧不成立:未知阶段、跳阶段、回退缺 reason、证据失败、锁冲突全部在写盘前返回或抛出,noop 分支也不写盘(与 `test/p4-tools.test.mjs:111-165` 断言一致)。
- “defer 绕过写锁”不成立:defer 的 state 读-改-写整体在 `withProjectLock` 内,锁外仅做只读 evaluation。
- “projectRoot 可被模型指向任意目录”不成立:`resolveProjectRoot` 强制 requestedRoot 与会话派生根 `isSamePath`(realpath + win32 归一化)相等,否则 `E_PROJECT_ROOT_FORBIDDEN`,且有测试覆盖。
- “P4 契约修正未落文档/测试”不成立:CONTRACTS.md 修正节存在,且 `p4-tools.test.mjs:276-281` 断言了节标题与关键条款。
