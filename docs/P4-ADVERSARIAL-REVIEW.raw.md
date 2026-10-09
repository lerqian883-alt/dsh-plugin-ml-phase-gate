# P4 对抗式评审报告

评审方式：静态只读。实际读取了指定的 17 个文件，并加读了支撑模块（`lib/state/schema.js`、`lib/state/lock.js`、`lib/project-root.js`、`lib/phases/loader.js`、`lib/phases/schema.js`、`lib/evidence/runner.js`、`lib/evidence/artifacts.js`、`lib/evidence/process.js`、`lib/contracts.js`、`lib/types/contracts.d.ts`、`phases.default.yml`）以验证证伪点。未运行测试（本会话只读、无 shell 执行），“P0–P4 全量 75 项通过”是未经本次独立验证的声明。

## 结论

**有条件通过**：判定引擎闭合性、失败不写盘、禁跳阶段、projectRoot 收敛等核心不变量经证伪尝试后均成立，但工具层读-改-写完全绕过项目锁（`E_WRITE_CONFLICT` 在工具路径不可达、并发可丢审计历史），且 advance/phases 的输出形状偏离 `docs/CONTRACTS.md` §2.10 冻结契约，两项须修后方可关闭 P4。

## 发现

**F1（高）advance/defer 读-改-写无锁，并发下丢历史/回退 declared，且 `E_WRITE_CONFLICT` 在工具路径不可达**
- 证据：`lib/tools/advance.js:42`（loadProject 时读 state）→ `:80-93`（长耗时证据运行，每检查默认 120s 超时，`lib/contracts.js:90`）→ `:106` 才 `writeStateAtomic`；`lib/tools/defer.js:42-68` 同样直写。`lib/state/store.js:86-92` 的 `updateState`/`lib/state/lock.js:85` 的 `withProjectLock`（含跨进程锁文件与进程内队列）存在但被 P4 工具完全不用。
- 原因：P0 契约 `docs/CONTRACTS.md:440,454-455` 明确“写锁冲突：返回 `E_WRITE_CONFLICT`，不自动重试；写锁作用域以项目根为单位”。两个会话（或同会话并行工具调用）共享同一项目根时，后写者基于陈旧 state 整体覆盖：可静默丢失对方的 history 条目、把 declared 写回旧值、或丢失 defer。读→写窗口长达分钟级，现实可触发。
- 最小修复：把 advance 的“分类+证据+写盘”与 defer 的读-改-写包进 `withProjectLock`，并在锁内重读 state、复核 `declared` 未变（或直接改用 `updateState`），让冲突按契约 fail loud；同时补一条并发写测试。
- 分类：**P4 必须修**。

**F2（中高）工具输出形状偏离 P0 冻结契约 §2.10，且未走 §6 的“先改文档再改代码”流程**
- 证据：契约 `docs/CONTRACTS.md:379-388` 规定 advance 失败输出为 `{ok, target, blockers, raw}`，实现返回 `to` 并新增 `from`/`error`/`evaluation`（`lib/tools/advance.js:45,62,83-102`，schema `lib/tools/schemas.js:81-103`）；契约 `:420-427` 规定 phases 输出为 `{phases, next}`，实现多出 `evaluation`（`lib/tools/phases.js:38-42`、`lib/tools/schemas.js:70-79`）；defer 输出契约未定义形状。§1 冻结“四个工具的名字、输入、输出”，§6（`:516`）要求“任何新增字段必须先更新本文和测试”。
- 原因：实现为可诊断性加字段、把 `target` 改名 `to`（与 `HistoryEntry.to` 一致），但 `docs/CONTRACTS.md` 未同步，冻结纪律被破坏；下游若按契约文档消费 `target` 字段会拿到 `undefined`。
- 最小修复：按 §6 流程更新 `docs/CONTRACTS.md` §2.10（advance 成功/失败全形状含 `to/from/error/evaluation`、phases 含 `evaluation`、补 defer 输出形状）并补契约测试；或反向把代码收敛回冻结形状（`to`→`target`、删多余字段）。二选一，不能维持现状。
- 分类：**P4 必须修**。

**F3（中）`next` 的两套口径不一致：status/phases 用全量证据，advance 只接受 declared+1；gap>0 时“推进到 next”实为无门控 rollback 并清 defer**
- 证据：`lib/tools/status.js:33-37`、`lib/tools/phases.js:33-36` 跑全量 `runEvidencePrefix`，`next` 由 `evidenced` 推出（`lib/engine/evaluate.js:64`）；advance 用 `maxStages: targetIndex` 截断的 prior 证据并额外要求 `to === declared+1`（`lib/tools/advance.js:53-59,80-81`）。当证据领先 declared（如 rollback 后检查仍全绿）时，status 报告的 `next` 会被 advance 以 `E_INVALID_TRANSITION` 拒绝；当 gap>0（declared=M2、evidenced=M0）时，status 引导的 `next=M1` 落入 rollback 分支（`lib/tools/advance.js:70-78`），无证据门控直接写盘并清除 defer。
- 原因：契约对“to === next”与“禁跳阶段”在 evidence 领先/落后时的交集没有精确定义，P4 选择了保守合取（有据可依，`docs/P4-IMPLEMENTATION-LOGIC.md:56-57`），但模型会收到自相矛盾的指引；rollback 免检是契约明文（`docs/CONTRACTS.md:393`），不是 bug。
- 最小修复：不改引擎；在 advance 的拒绝消息中同时给出 declared+1 与 status 口径的 next，或由 P5 UI/文档明确“status.next 是证据视角，advance 目标是 declared+1”，并把“gap>0 时 advance-to-next 等价 rollback”写进用户可见文档。
- 分类：后续风险。

**F4（中）契约“成功后必须追加整值快照”（§2.10 `:397`）在 P4 未实现，按分期推迟到 P5**
- 证据：`lib/tools/advance.js:105-114` 成功路径只写 state 并返回，无任何快照事件追加；`docs/P4-IMPLEMENTATION-LOGIC.md:5` 明确不包含 P5 投影。
- 原因：分期切分本身合规，但该义务目前无任何代码或测试锚点，若 P5 漏做即成为已上线违约。
- 最小修复：在 P5 任务清单/NEXT 中落一条可验收项（advance 成功 → 快照事件），P4 验收记录里注明“快照义务移交 P5”。
- 分类：后续风险。

**F5（中）测试缺口：多条非 happy path 分支零覆盖**
- 证据（均在 `test/p4-tools.test.mjs` 中缺席）：并发写/锁冲突（对应 F1）；prior 证据失败的前向分支（`lib/tools/advance.js:82-90` 的 "evidence supports next=…"）；noop 分支（`:65-68`，含“不写盘”断言）；无 state 时 defer（`lib/tools/defer.js:43-45`）；未知 `to`（`advance.js:44-46`）；`E_STATE_CORRUPT` 经工具触发；输出与 schema 的一致性校验（用任一 JSON Schema 校验器跑 execute 结果）；`registerTools` disposer 真正被调用（`test/p1-skeleton.test.mjs:73-97` 注册了 stub 但从不调用/断言 dispose）；defer 设置后 advance 成功清除 defer 并在 history 留痕的端到端断言；`by='unknown'` 回退。
- 原因：现有 13 条测试对“目标失败/artifact 缺失/跳阶段/rollback 无 reason/projectRoot 越界”覆盖良好，但上述分支只靠类型系统兜底。
- 最小修复：至少补 F1 并发测试、noop 不写盘、prior 失败分支、defer 无 state 四条；schema 一致性可用一次性校验测试覆盖四个工具。
- 分类：后续风险（其中并发测试随 F1 属必须修的验收部分）。

**F6（低中）DSH 宿主形状假设未经真实宿主断言**
- 证据：`exec.agent.id` 作为 defer `by` 来源（`lib/tools/defer.js:48`）、`ctx.tools.register` 返回 disposer 的约定（`lib/tools/index.js:31`）、`output.schema/render` 与 `oneOf` null 的校验器行为，均只依据 `docs/P4-IMPLEMENTATION-LOGIC.md:22-34` 的文档检索记录；p1 测试用假 ctx，未触及真实 `@deepseek-ai/dsh`。
- 原因：P1 安装链测试不加载真实宿主，这些假设若与 0.1.7-rc.2 实际类型有出入（如 agent.id 不存在），只优雅降级到 `'unknown'`，但 register 返回非函数会使卸载路径失效（被 `lib/index.js:43-44` 的 try/catch 吞掉）。
- 最小修复：在真实宿主（P1 安装链或后续真机门）加一条“注册→执行→卸载”冒烟断言。
- 分类：后续风险。

**F7（低）`evidenceSnapshot` 只记目标阶段 checks，不含 prior 阶段复验证据；rollback 快照恒为空**
- 证据：`lib/tools/advance.js:75`（rollback 快照 `[]`）、`:105`（forward 只存 `targetEvidence.checks`）；prior 前缀（`:80`）复验了 0..target-1 全部阶段但结果不落审计。
- 原因：契约 `:164` 只说“当时证据摘要”，措辞含糊；实现选择可用，但“本次迁移由哪些证据支撑”在审计上不完整。
- 最小修复：文档澄清快照范围即“目标阶段出口证据”，或改为存合并后的全部 CheckResult（注意截断上限）。
- 分类：后续风险。

**F8（低）`E_DEFERRED` 语义拉伸 + defer/rollback 也会执行全量项目检查**
- 证据：无 state 时 defer 返回 `E_DEFERRED`（“defer 输入无效”，`docs/CONTRACTS.md:441`）用于“尚无 state”（`lib/tools/defer.js:43-45`）；rollback/defer 成功路径都跑全量 `runEvidencePrefix`（`lib/tools/advance.js:74`、`lib/tools/defer.js:69-72`），即执行项目自有脚本、最坏 ~9 阶段×120s。
- 原因：错误码复用无更贴切选项；证据运算是设计使然（授权边界等同 shell），但 rollback 免检却仍执行检查属于纯成本。
- 最小修复：defer 无 state 可改用更准确错误码或在契约中注明；rollback/defer 可跳过证据运行（evaluation 里 evidenced 置 null 或复用缓存），需契约确认。
- 分类：后续风险。

**F9（低）`writeStateAtomic` Windows 回退 `copyFile` 非原子（P2 遗留，P4 放大暴露面）**
- 证据：`lib/state/store.js:61-74`：`rename` 遇 EPERM/EACCES 回退 `copyFile`，中途崩溃会留下截断 JSON → 下次读取 `E_STATE_CORRUPT`，无备份可恢复。
- 原因：P2 行为，P4 的长窗口高频率写盘使其更易暴露。
- 最小修复：回退路径先写 `.bak` 或改用 `fs.rename` 重试策略；归 P2/P5 处理。
- 分类：后续风险（不归属 P4）。

**F10（很低）边角健壮性**
- 证据：`lib/tools/helpers.js:50` 对显式 `args=null` 直接属性访问会 TypeError（默认值只兜 undefined）；`requireStringArg` 抛裸 `TypeError` 而非 `PhaseGateError`（`:64-70`）；rollback 的 reason 空白串可通过 `!reason` 检查（`lib/tools/advance.js:71`，`optionalStringArg` 不 trim）；`presentCall(args)` 在 args 缺省时 `args.to` 会抛（`advance.js:116`、`defer.js:75`）。
- 原因：DSH 正常路径都会传对象且先过输入 schema，实害趋零。
- 最小修复：`args?.projectRoot`、reason 判空改 trim、presentCall 加 `args?.`。
- 分类：后续风险（可顺手修）。

## P4 必须修

1. **F1**：advance/defer 的读-改-写接入 `withProjectLock`/`updateState`，锁内重读并复核 `declared`，使并发冲突按契约返回 `E_WRITE_CONFLICT`；补并发写测试。
2. **F2**：消除输出形状与 `docs/CONTRACTS.md` §2.10 的漂移（`target` vs `to`、phases 多出的 `evaluation`、advance 多出的 `from/error/evaluation`、defer 输出未定义）——按 §6 更新契约文档+测试，或把代码收敛回冻结形状。

## 后续风险

1. **F3**：status/phases 的 `next`（证据视角）与 advance 唯一可接受目标（declared+1）口径不一致；gap>0 时 advance-to-next 退化为免检 rollback 且清 defer——需 P5 UI 与文档显式澄清。
2. **F4**：“成功 advance 必须追加整值快照”义务移交 P5，需落为可验收任务，防漏做。
3. **F5**：非 happy path 测试缺口清单（noop、prior 失败分支、defer 无 state、未知 to、E_STATE_CORRUPT、schema 一致性、disposer、defer→advance 清除链路、by=unknown）。
4. **F6**：`exec.agent.id`、register-disposer、output schema 校验行为仅有文档检索依据，缺真实 DSH 宿主冒烟。
5. **F7**：history `evidenceSnapshot` 仅含目标阶段证据，审计范围需文档澄清。
6. **F8**：`E_DEFERRED` 复用语义拉伸；defer/rollback 触发全量项目检查的副作用与最长时延。
7. **F9**：Windows 下 `copyFile` 回退非原子（P2 遗留）。
8. **F10**：边角健壮性（args=null、裸 TypeError、空白 reason、presentCall 缺参）。
9. 本次未运行测试：`test` 脚本与“75 项通过”声明未经独立执行验证（评审环境只读）。

## 误报

1. **“证据领先 declared 时 forward 死锁”**——证伪：advance 的 prior 证据被 `maxStages: targetIndex` 截断（`lib/tools/advance.js:80`、`lib/evidence/gate.js:87-90`），`evidenced` 不可能超过 target-1，`next` 恒 ≤ `to`，逐步推进永远可行；仅剩 F3 的报告口径问题。
2. **“目标失败/artifact 缺失路径可能写盘”**——证伪：所有失败 return 都在 `writeStateAtomic` 之前（`lib/tools/advance.js:83-102`），artifact 缺失经 `runStageEvidence`→`checkArtifacts` 归入同一门（`lib/evidence/gate.js:65-70`、`artifacts.js:101-103`），测试亦断言 declared 不变（`test/p4-tools.test.mjs:109-134`）。
3. **“classifyTransition 对 declared=null 分类缺失”**——证伪：declaredIndex=-1，`to=首阶段` 时 `0 === -1+1` 判 forward 并要求 `to === next(null)=首阶段`（`lib/engine/evaluate.js:103-121`），null 初始化有测试覆盖（`test/p4-tools.test.mjs:233-250`）。
4. **“projectRoot 可用大小写/斜杠/符号链接差异绕过”**——证伪：`isSamePath` 走 `realpath` + win32 统一小写（`lib/project-root.js:69-93`），派生根本身也先 realpath（`:40`）。
5. **“跳阶段会先跑检查再拒绝”**——证伪：provisional 分类在证据运行之前直接 return（`lib/tools/advance.js:53-62`）。
6. **“defer 会影响 evidenced/gap 或阻止 advance”**——证伪：defer 只写 `defer` 与 history（`lib/tools/defer.js:63-67`），evaluation 由同一证据重算；advance 不读 defer，仅在成功时清除（`lib/engine/evaluate.js:162-167`）。

未修改任何文件，未进入 P5/P6。
