搜索工具在本环境不可用（spawn 被拒），已改为直接通读全部指定文件及其依赖模块（contracts/config/evaluate/store/schema/loader/runner/project-root/errors/helpers/tools-index/schemas/index.d.ts）。以下为静态对抗评审结论；测试套件未能实际执行（无可用 shell），宿主 `dsh-session-projection` 源码不在仓库内、无法本地独立复核，该两点按文档声明采信并标注。

## 结论

有条件通过：注入/投影/deferContext 桥接主体正确且未越界 P6，但 pre-step 节流缓存存在一个默认参数下高概率触发的“陈旧快照回放”缺陷（F1），且文档完成定义中声称的多个关键行为（defer 快照、无 state 不播种、节流）零测试覆盖（F2），须先闭合。

## 发现

**F1｜高：TTL 缓存命中会把比当前投影更旧的快照注入回去，投影被整值回滚**
- 证据：`lib/inject/pre-step.js:59-64`（缓存命中直接采用旧 `computed`）→ `lib/inject/pre-step.js:70`（与 current 指纹不同即注入）→ `lib/projection/definition.js:20`（decode 成功整值替换）；触发源 `lib/tools/advance.js:89,122`、`lib/tools/defer.js:84`（工具成功后 deferContext 已把投影推进）。
- 原因：时序 t0 pre-step 计算 X(M0) 并缓存；t0+1s 模型调 advance M0→M1，deferContext 送 Y(M1)，投影=Y；t0+2s 下一步 pre-step 时 `preStepThrottleMs`（默认 5000）未到期 → `computed` 取缓存 X，current=Y，`isSameFingerprint` 为 false → 注入 X → 投影回滚到 M0，模型收到错误的 `declared: M0` 提示；TTL 过期后下一轮才重算恢复。agent 循环中工具调用后数秒内进入下一步是常态，默认参数下高概率命中。文档 §5 只承认“TTL 到期后重播”，未承认“注入比 current 更旧的值”。
- 最小修复：二选一——(a) 工具成功写盘后失效对应 session 的缓存条目（advance/defer 成功路径或 `deferSnapshotContext` 内删除 `CACHE` 中 `exec.agent.session` 条目）；(b) 缓存命中时本轮直接跳过注入（缓存只用于抑制，不用于注入），首次播种不受影响。
- 分类：P5 必须修。

**F2｜高：测试以 happy path 为主，文档 §7/§8 自称覆盖的多项行为无测试证据**
- 证据：`test/p5-projection.test.mjs` 全文 10 个用例：无 `defer` 的 deferContext 用例；无 advance 失败/noop/rollback 不发快照的负向断言；`makeProject` 支持 `declared:null` 但没有任何“无 state 不播种”用例；所有 pre-step 用例均 `preStepThrottleMs: 0`（`:16`），节流路径（恰是 F1 所在）零覆盖；`decodeSnapshot` 负向（坏 kind/form/name/JSON/version/字段类型）零覆盖；`apply` 的“非 null state + 无关事件同一引用”、外来 source 的 user/message、decode 失败保留旧值零覆盖；pre-step 的 reject/abort/无 session/异常 warn 通道零覆盖；fingerprint 对 defer/deferReason/evidenced 变化的触发未直接验证（仅 declared）。
- 原因：P5 完成定义（P5-IMPLEMENTATION-LOGIC.md §8“无 state 时不播种”“同指纹抑制、变化重播”）中多条声明缺少对应断言，回归保护缺失。
- 最小修复：按 §7 测试策略清单补齐上述负向/边界用例，特别是 defer 成功送快照、advance noop/失败不送、无 state 不播种、throttle>0 行为（含 F1 修复的回归用例）。
- 分类：P5 必须修。

**F3｜中：zod 适配器表面极窄，宿主漂移即碎，且文档只承认了三种风险之一**
- 证据：`lib/projection/schemas.js:64-69` 仅 `{parse}`；抛裸 `TypeError`（无 `.issues`）；返回 `Object.freeze(value)` 同引用（zod 返回新可变对象）。宿主行为依据是文档 §2 对 `dsh-session-projection@0.1.7-rc.2` 的检索记录，仓库内无该源码可独立复核；package.json 无任何依赖（无 zod），宿主一旦调用 `safeParse`、检查 `error.issues`、或对 parse 结果做赋值变异（ESM 严格模式抛 TypeError），插件即崩。
- 原因：适配契约是“只调用 `.parse` 且 throw 即非法”这一单一假设，绑定精确宿主版本。
- 最小修复：在 CONTRACTS.md P5 修正节补记 safeParse/issues/冻结返回值三点假设；宿主升级时把 `registerProjection` 冒烟列为必跑门；（可选）适配器补一个 `safeParse` 别名，成本一行。
- 分类：后续风险。

**F4｜中：pre-step 每 TTL 周期全量执行证据前缀，agent 每步可能被阻塞数分钟**
- 证据：`lib/inject/pre-step.js:62` → `computeAgentSnapshot` → `lib/evidence/gate.js:80-100` 顺序跑全部 stage 的 verify.cmd，每个最长 `checkTimeoutMs=120000`；默认 `preStepThrottleMs=5000` 意味着持续会话中约每 5 秒重跑整个前缀。契约要求 `evidenced` 不封顶于 declared，无法用 `maxStages` 截断。
- 原因：P4 只在 advance 时跑检查，P5 把它变成每步开销；慢检查/有副作用的项目会被高频执行项目脚本。
- 最小修复：对证据结果按 `(root, state.json 内容指纹)` 做短 TTL 缓存，或在文档标注 pre-step 的运营边界与 `preStepThrottleMs` 调优指引。
- 分类：后续风险。

**F5｜低：defer 写盘在锁内、证据与快照在锁外，异常时状态已变但无快照**
- 证据：`lib/tools/defer.js:47-74`（锁内写）→ `:79-84`（锁外跑证据、deferContext）。写成功后 `runEvidencePrefix` 抛错则工具报错且本轮无快照；并发 advance 可插入产生陈旧快照。存在下轮 pre-step 自愈。
- 原因：快照评估移出锁外换取锁持有时间短。
- 最小修复：将评估纳入锁内，或接受自愈并在文档记录该窗口。
- 分类：后续风险。

**F6｜低：`decision.messages` 缺失时 pre-step 永久静默**
- 证据：`lib/inject/pre-step.js:76` `[...decision.messages, message]`，若宿主 decision 无 messages 数组则抛错，被 `:77-82` catch 吞掉只 warn，此后每轮都不注入。
- 原因：依赖宿主 decision 形状（按 dsh 先例应有 messages，未本地核实）。
- 最小修复：改为 `[...(decision.messages ?? []), message]`。
- 分类：后续风险。

**F7｜低：`Date.now()` 回拨延长缓存复用**
- 证据：`lib/inject/pre-step.js:59` `now - cached.at < preStepThrottleMs`，时钟回拨时差值为负、恒小于 TTL，陈旧复用持续到时钟追上缓存时间戳。
- 原因：非单调时钟。
- 最小修复：改用 `Math.max(0, now - cached.at)` 或单调计时。
- 分类：后续风险。

## P5 必须修

1. F1：修复 pre-step TTL 缓存命中时注入陈旧快照导致投影回滚（缓存失效于工具成功写盘，或缓存命中时跳过注入），并补对应回归用例。
2. F2：补齐负向/边界测试——defer 成功经 deferContext 送快照、advance noop/失败不发、无 state 不播种、`preStepThrottleMs>0` 行为、decodeSnapshot 负向、apply 同引用（非 null state）与 decode 失败保留旧值、pre-step reject/abort/异常通道。

## 后续风险

1. F3：zod 适配器仅暴露 `parse`、抛裸 TypeError、返回冻结同引用；宿主调用 `safeParse`/检查 `.issues`/变异返回值即崩；绑定 `@deepseek-ai/dsh@0.1.7-rc.2`，宿主升级须重验，契约修正节应补记这三点。
2. F4：pre-step 每 TTL 周期全量跑证据前缀，慢检查项目每步阻塞可达分钟级，且高频执行项目脚本。
3. F5：defer 快照评估在锁外，异常或并发窗口内本轮无快照（有 pre-step 自愈）。
4. F6：`decision.messages` 缺失时 pre-step 永久静默（依赖宿主 decision 形状）。
5. F7：时钟回拨延长节流缓存复用窗口。

## 误报

1. “无 state 会误播种”——`readState` ENOENT 返回 null（`lib/state/store.js:39`）→ `computeAgentSnapshot` 返回 null 不注入；corrupt state 或 declared 不在 phases 均抛 `PhaseGateError`/`STATE_CORRUPT`（`lib/state/schema.js:167`、`lib/engine/evaluate.js:51-53`）→ 被 pre-step catch 吞为 warn。代码正确（缺测试归入 F2）。
2. “projection apply 对无关事件不返回同一引用”——`lib/projection/definition.js:18-20` 两个 early return 原样返回 `state`，decode 失败 `?? state` 保留旧值；代码正确（测试只覆盖 null 态）。
3. “fingerprint 漏字段或不忽略 updatedAt”——九个语义字段全含、updatedAt 确实排除（`lib/snapshot/codec.js:35-47`），且 fingerprint 自建固定键序对象，不受输入键序影响；declared/evidenced/gap/next/defer/deferReason 变化均会改变指纹。
4. “noop 会误发快照”——advance noop 路径（`lib/tools/advance.js:76-79`）无 `deferSnapshotContext`，符合 P5 契约修正“noop 不发送”。
5. “P4 exec 无 deferContext 会崩”——`deferSnapshotContext` 有函数存在检查（`lib/snapshot/message.js:34`），P4 测试的 exec 不带该字段仍兼容，P0–P4 工具形状、注册顺序、安装链（package.json exports/files、cordis.patch）均未变。
6. “cache 跨会话串扰”——`CACHE` 为模块级 WeakMap、按 session 对象隔离、GC 安全；两个会话各自持有独立条目。
7. “P5 越界 P6”——无 slots/UI/locale/CSS/L4 印记；`lib/inject/render.js` 是模型向提示文本，属 P5 注入范围。
