## 结论
有条件通过——四项必修在代码与测试层面均已闭合，静态审查未发现新的 P5 blocker、未见破坏 P0–P4 契约或安装链；条件是补一份实际执行的绿色 `npm test`（p0–p5 九个文件）与一次真实宿主冒烟作为证据，因为本轮复核环境无法派生进程、未能代跑测试。

核验依据（逐项）：

1. **TTL cache 失效**：`deferSnapshotContext` 在送快照前先 `invalidateSnapshotCache(exec?.agent?.session)`（lib/snapshot/message.js:35），且放在 `deferContext` 存在性检查之前（缺 `deferContext` 也失效，方向安全）。三个调用点（advance 前进 lib/tools/advance.js:122、回滚 :89、defer lib/tools/defer.js:78）均在 `writeStateAtomic` 成功后、锁内触发。测试 `throttle cache is invalidated when a deferred snapshot is emitted`（test/p5-projection.test.mjs:220）用 `preStepThrottleMs: 5000` 复现“缓存旧 X vs 投影新 Y”，断言二次 pre-step 零消息——去掉失效逻辑该测试会失败，是有效回归测试。
2. **八类测试齐全**：defer 成功送快照（:160、:192-195）；advance noop/失败不发（:188-190、:197-200）；无 state 不播种（:207）；throttle>0（:220）；decodeSnapshot 负向四种（:247）；apply 同引用三种（:255）；safeParse（:263）；reject/abort/缺 messages（:268）。
3. **defer 收锁**：lib/tools/defer.js:47-80 的 readState、write、`runEvidencePrefix`、`evaluatePhase`、`buildSnapshot`、`deferSnapshotContext` 全部在 `withProjectLock` 回调内；且锁内重读 state，无丢失更新。
4. **decision.messages 缺失**：lib/inject/pre-step.js:75 用 `[...(decision.messages ?? []), message]` 重建 decision，不 mutate 原对象，测试 :280-281 覆盖。
5. **P0–P4/安装链**：contracts.js/contracts.d.ts、p0/p1 测试断言（含 `preStepThrottleMs`、`sessionProjections` inject、`p5-bridge` 标签）互相一致；advance/defer 返回形状未变，P4 测试的 exec 无 `deferContext`，走早退分支不受影响；package.json `files`/`exports` 引用的 lib/index.d.ts、lib/types/contracts.d.ts、cordis.patch.yml、phases.default.yml、docs/ 均在盘。未发现 P6 越界内容。

## 仍存在的 P5 blocker
无。

## 后续风险
- **宿主 session 对象同一性假设**：缓存失效按 `exec.agent.session` 的 WeakMap 键命中，pre-step 按 `agent.session` 键写入；单测共用同一对象，真实 DSH 若给工具和 pre-step 传的是重建/序列化的 session 对象，失效会静默落空，“旧 X 覆盖新 Y”可能在真机上复发。需要真实宿主证据，不能只靠单测。
- **defer 消息与投影折叠的时序**：若宿主把 deferred user/message 折叠进 mlPhase 投影的时机晚于下一次 pre-step，下一步会重注入同一快照（重复的新 Y，非旧数据）。良性但依赖宿主事件顺序。
- **带外改 state 的 TTL 盲区**：人工/外部进程直接改 state.json 不触发失效，pre-step 在 `preStepThrottleMs`（默认 5s）窗口内可发陈旧快照。有界、属节流设计代价，建议写入文档。
- **缓存未按项目根/cwd 区分**：同一 session 的 cwd 若在步间变化，TTL 命中可能注入上一项目的快照；当前宿主模型下概率低。
- **defer 持锁跑证据**：`runEvidencePrefix` 进锁后，verify.cmd 慢（上限 `checkTimeoutMs`=120s）会拉长锁占用，跨进程写者将吃 E_WRITE_CONFLICT。与 advance 同模式，属 P4 既有设计的延伸，非本轮回归。
- **README 陈旧**：README.md 仍写“当前状态 P4”“不注册会话投影、不注入上下文”，与 P5 实现矛盾，且随包发布（files 含 README.md）。仅文档问题。
- **本复核为纯静态**：Glob/Grep 在本环境 EPERM、无 shell，未执行任何测试；绿色套件证据须由实现方提供。

## 误报
- `deferSnapshotContext` 在无 `deferContext` 时也失效缓存——不是泄漏或误伤：失效后下一步 pre-step 重算并注入新快照，恰好补上 defer 通道缺失的送达，是安全方向。
- 缓存存入 `null`（无 state 项目）不是污染：`getCachedSnapshot` 命中返回 `null`，按“无 state 不播种”处理，TTL 过期自愈。
- advance noop 跑了证据却不 defer——不是漏发：noop 不改 state，投影本就正确，规格明确要求 noop 不发。
- defer 在指纹未变（如 clear 回到原状）时仍 defer——不是重复覆盖：送的是写后新算的快照，指纹相同则投影折叠为 no-op。
- 对冻结 decision 的 messages 合并——`{ ...decision, messages: [...] }` 新建对象，不改原 decision，无冻结冲突。
