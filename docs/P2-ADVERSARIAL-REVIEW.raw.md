## 结论

有条件通过：P2 结构、合并、绑定、项目根、fail-loud 语义基本正确且无越界，但锁的 stale 回收存在双持竞态、原子写 fallback 的错误处理顺序会造成“已写盘却报失败”，加上两处 fail-open 的解析/schema 缺口，需小修后放行。

## 发现

1. **[高] stale 锁回收把“不可解析的锁文件”判为无限龄，可误删刚创建的持有者锁，导致双进程同时持锁。**
   证据：`lib/state/lock.js:40-44` 先 `open(lockPath, 'wx')` 再 `writeFile(payload)`——文件创建到写入之间存在对其他进程可见的空文件窗口；`lib/state/lock.js:51-53,61` 中 `readLock` 对空文件/坏 JSON 返回 `null`，`at = NaN`，`age = Infinity`，`Infinity < staleMs` 为 false，直接 `unlink` 后重试。进程 A 在窗口内被进程 B 回收锁，A 继续写 payload 并自认持锁，B 也成功 `wx` 创建——两个写者同时进入 read-modify-write，丢失更新。
   原因：回收判定把“读不到 at”与“明确过期”混为一谈；`unlink` 与 `open('wx')` 之间也无原子性保证，但该窗口由 `wx` 唯一创建语义兜底，真正的洞是空锁被判 stale。
   最小修复：`existing` 为 `null`（读不到或解析失败）时不回收——视为新鲜冲突抛 `E_WRITE_CONFLICT`，或用锁文件 `stat().mtime` 兜底计算年龄后再判定；只有能解析且年龄明确 ≥ staleMs 才 `unlink`。
   分类：P2 必须修。

2. **[高] `writeStateAtomic` 的 rename fallback 先执行副作用、后过滤错误码，“已写盘却向上报失败”，且 `copyFile` 抛错时 temp 泄漏、target 可能半写。**
   证据：`lib/state/store.js:56-62`——catch 块先 `await copyFile(temp, target)`、`await unlink(temp)`，然后才 `if (error && !['EEXIST','EPERM','EACCES'].includes(error.code)) throw error`。rename 因 `EBUSY`/`ENOSPC` 等白名单外原因失败时，state 实际已被 copy 覆盖、temp 已删，却仍把 rename 的原错误抛给调用者；若 `copyFile` 自身抛出（磁盘满），`unlink` 不执行（temp 残留），target 已被部分覆盖（下次 `readState` 报 `E_STATE_CORRUPT`）。
   原因：错误码白名单判断放在了不可逆副作用之后。
   最小修复：先按 `error.code` 判断——白名单外直接 rethrow；白名单内再 copy；copy 失败路径补 temp 清理并向上报告真实失败。
   分类：P2 必须修。

3. **[中] YAML 子集：`#` 无前导空白即被当注释，静默截断标量，方向是 fail-open。**
   证据：`lib/yaml-subset.js:57`（`stripComment` 对引号外任意 `#` 截断，未要求前置空白）；YAML 规范要求 `#` 前是空白或行首才是注释。后果：`version: 1#x`（真 YAML 值为字符串 `"1#x"`，应 `E_PHASES_INVALID`）被静默读成 `1` 而通过校验；`name: 数据#v2`、`commonPitfalls: [坑#1]`（不带引号内联项同理经 `parseScalar` 前的截断链）被静默改写内容。这与 `docs/P2-IMPLEMENTATION-LOGIC.md:62`“阶段定义必须 fail closed，不能静默误读”直接冲突。
   原因：解析器比规范宽松，且宽松方向恰好落在校验关键字段（`version`）上。
   最小修复：`#` 仅在其位于行首或前一字符为空白时才终止内容；否则视为标量一部分。
   分类：P2 必须修。

4. **[中] state schema 错误接受坏 history：`evidenceSnapshot` 条目无形状校验且被静默变形。**
   证据：`lib/state/schema.js:74`——`Object.freeze({ ...item })`：item 为数组时展开成 `{0:...,1:...}` 的索引键对象，标量时成空对象 `{}`，任意对象原样冻结；`docs/CONTRACTS.md` 2.5/2.6 冻结的 `CheckResult` 必需字段（`stage/check/exitCode/status/stdout/stderr/durationMs/ranAt`）一概不查。`evidenceSnapshot: ["junk"]` 或 `[["a"]]` 都被接受并落盘形态改变。禁止字段（`evidenced/gap/next`）检查本身是正确的（`schema.js:91-95`，`Object.hasOwn` 只查自有属性，无原型绕过）。
   原因：P2 只校验了数组性；但 `state.json` 是审计资产且 `readState` 直接消费外部文件，坏数据静默通过违背“损坏状态 fail loud”的完成定义（`P2-IMPLEMENTATION-LOGIC.md:191`）。
   最小修复：条目必须是 plain object（拒绝数组/标量/null），并校验契约 2.6 必需字段的类型；截断上限等语义留给 P3。
   分类：P2 必须修。

5. **[中] 契约明文不变量“一个检查文件不得被多个阶段共享”无任何测试覆盖。**
   证据：`lib/phases/schema.js:210-218` 的 `owners` 分支（`check file ... is shared by multiple phases`）在 `test/p2-phases.test.mjs:58-71` 只测了 multiple/zero 前缀匹配，未测两阶段共享同一前缀（或同前缀文件）被拒。同一 Map `bindings.set(prefix, file)` 在共享场景由 owners 先抛出，逻辑本身正确（见误报 3），但该分支零覆盖，回归无护栏。
   原因：测试只覆盖单阶段视角。
   最小修复：补一条两阶段同前缀（或同绑定文件）的 `bindCheckFiles` 拒绝测试。
   分类：P2 必须修。

6. **[低] `copyFile` fallback 本身非原子，rename 被拒场景（编辑器/杀毒占用 state.json）存在损坏窗口。**
   证据：`lib/state/store.js:59`；`docs/P2-IMPLEMENTATION-LOGIC.md:164` 已声明该权衡。copy 中途崩溃/断电 → `state.json` 半写。
   原因：Windows 上无原子 replace 的兜底本就受限。
   最小修复：fallback 改为“copy 到第二个 temp → 再次 `rename(temp2, target)`”，仅当二次 rename 仍失败才直接覆盖；文档标注残余风险。
   分类：后续风险。

7. **[低] `history` 缺省被容忍为 `[]`，与契约“必需”漂移。**
   证据：`lib/state/schema.js:104`（`document.history ?? []`）vs `docs/CONTRACTS.md` 2.5 字段表（`history` 必需）。缺 `history` 的文档被静默补空。
   原因：宽松缺省。
   最小修复：缺失时按 `E_STATE_CORRUPT` 拒绝，或在两份文档中显式声明该宽松并补测试。
   分类：后续风险。

8. **[低] 锚点/别名/tag 不拒绝而是当普通字符串字面量。**
   证据：`lib/yaml-subset.js:197`（兜底返回原文本）——`name: *alias` 读成字符串 `"*alias"`、`version: !!int 1` 读成 `"!!int 1"`。后者会 fail closed，前者静默字面量化，与“不支持的 YAML 特性 fail closed”（`P2-IMPLEMENTATION-LOGIC.md:53-60`）不符。
   最小修复：plain scalar 以 `&`/`*`/`!` 开头时抛 `YamlSubsetError`。
   分类：后续风险。

9. **[低] BOM 不剥离。**
   证据：`lib/yaml-subset.js:66-84` 无 BOM 处理——带 BOM 的 `phases.yml`（Windows 记事本/PowerShell 5.1 常见产物）首个 key 变 `\uFEFFversion` → `E_PHASES_INVALID`。fail closed 方向，但会对 Windows 用户造成假阴性。
   最小修复：解析前剥 `\uFEFF`。
   分类：后续风险。

10. **[低] 顶层重复 key 静默后者覆盖、未知字段静默丢弃。**
    证据：`lib/yaml-subset.js:221-244`（重复 key 覆盖）；`lib/phases/schema.js:135-147`（normalize 只保留已知键）——typo 如 `supersede:` 无提示被忽略。
    最小修复：解析器对同层重复 key 报错；schema 可选 strict 拒绝未知字段。
    分类：后续风险。

11. **[低] state 路径与锁路径硬编码默认值，忽略 config。**
    证据：`lib/state/store.js:17-19`、`lib/state/lock.js:14-16` 固定 `DEFAULT_PROJECT_STATE_FILE`/`PROJECT_STATE_DIR`；而 `loadPhases` 支持 `options.projectPhasesFile`（`lib/phases/loader.js:64`），不对称。契约 2.2 允许 `projectStateFile` 配置，P3/P4 接线时需要扩签名。
    分类：后续风险。

12. **[低] `withProjectLock` 的进程内 key 未规范化。**
    证据：`lib/state/lock.js:80`（`key = projectRoot` 原样）。同一路径的大小写/分隔符不同拼写会落入不同 promise 队列，同进程串行失效；此时由跨进程文件锁兜底报 `E_WRITE_CONFLICT`（fail loud，不丢数据，但违背“同进程串行”意图）。`findProjectRoot` 已 realpath，上游统一传其返回值时无实际影响。
    最小修复：key 用 `normalizePathForCompare` 的结果（需同步化或预规范化）。
    分类：后续风险。

13. **[低] 非 ENOENT 的 fs 错误裸抛、marker 命中不校验类型。**
    证据：`lib/state/store.js:35-39`（`EISDIR`/`EACCES` 直接传播，无错误码包装）；`lib/phases/loader.js:35-38`（`readCheckFiles` 同样）；`lib/project-root.js:49`（`stat` 命中即可，`work/verify.cmd` 若为目录也判项目根）。fail loud 仍成立，仅错误形态不统一。
    分类：后续风险。

14. **[低] 其余缺口**：同 key 嵌套 `withProjectLock` 会死锁（P2 无嵌套调用）；`writeStateAtomic` 无 fsync（崩溃窗口）；`toLowerCase` 与 NTFS 大小写表在极边缘 Unicode 字符上有理论差异；`requireCheckPrefix` 用 `\d{3,}`（`lib/phases/schema.js:70`）比契约示例 "NNN" 宽（因 `-` 整段边界匹配无碰撞，建议与契约对齐说明）。测试侧未覆盖：rename fallback 故障路径（`p2-state.test.mjs:24-25` 的 temp 清理断言只覆盖成功路径）、`readState` 对 schema 级坏文件（含 forbidden 字段、坏 `evidenceSnapshot`）的集成路径、`loadPhases` 对损坏项目 `phases.yml` 的 `E_PHASES_INVALID` 集成路径、`findProjectRoot` 的 symlink/realpath 与 win32 大小写比较、`updateState` updater 抛错时不落盘且锁释放。
    分类：后续风险。

## P2 必须修

1. **锁回收竞态**（发现 1）：`readLock` 返回 null 时不得按 stale 回收；改判新鲜冲突或用 mtime 兜底。这是写锁核心承诺的正确性缺陷。
2. **rename fallback 错误处理顺序**（发现 2）：错误码过滤提前到任何副作用之前；补 copy 失败时的清理与真实错误上报。
3. **`#` 注释前导空白规则**（发现 3）：消除 `version: 1#x` 这类 fail-open 静默误读，兑现“不静默误读”的文档承诺。
4. **`evidenceSnapshot` 条目校验**（发现 4）：至少拒绝非 plain-object 条目，阻止数组/标量被静默变形后落盘。
5. **补“检查文件跨阶段共享”拒绝测试**（发现 5）：契约明文不变量零覆盖。

## 后续风险

1. `copyFile` fallback 非原子的损坏窗口与二次 rename 改进（发现 6）。
2. `history` 缺省容忍与契约“必需”漂移（发现 7）。
3. 锚点/别名/tag 未 fail closed（发现 8）。
4. BOM 假阴性（发现 9）。
5. 重复 key 覆盖与未知字段静默丢弃（发现 10）。
6. state/锁路径硬编码忽略 config（发现 11）。
7. 进程内锁 key 未规范化（发现 12）。
8. 裸 fs 错误与 marker 类型不校验（发现 13）。
9. 发现 14 所列：嵌套锁死锁、fsync、大小写边缘、`\d{3,}` 宽松、以及各测试缺口。
10. 本次为只读评审，未能实际运行 `npm test`；“39 项测试通过”是 `docs/P2-IMPLEMENTATION-LOGIC.md:185` 的声明，未经独立验证。

## 误报

1. **多文档/残留内容会静默放过**——不成立：`parser.index !== lines.length` 强制拒绝（`lib/yaml-subset.js:313-316`），`---`/`...` 分隔后的第二文档会以 "unexpected trailing content" 报错。
2. **不带引号的内联前缀 `[010]` 会被误当字符串前缀**——不成立：`Number("010")=10` 为数字，`requireString` 拒绝，fail closed。
3. **同一检查文件可能被多阶段共享**——不成立：`owners` Map 以文件名登记并拒绝二次归属（`lib/phases/schema.js:210-218`）；同前缀两阶段先触发共享拒绝，`bindings` 不会被覆盖。
4. **合并会丢默认阶段或覆盖错误**——不成立：按 id 覆盖、新 id 追加、合并后再走一遍 `normalizePhasesDocument` 唯一性校验（`lib/phases/schema.js:158-179`）；supersedes 拼接次序确定。
5. **stale 回收违反“E_WRITE_CONFLICT 不自动重试”**——不成立：新鲜冲突路径直接抛错不重试；回收是文档 §9 声明的独立机制。
6. **`withProjectLock` 的 promise 链会产生 unhandled rejection**——不成立：`gate` 是 resolve-only，`fn` 的错误不进入链，链上 promise 永不 reject。
7. **release 会误删他人锁**——不成立：token 比对后才 `unlink`（`lib/state/lock.js:45-48`）。
8. **`a:b` 无空格冒号会被误读为键值**——不成立：`splitKeyValue` 要求 `:` 后跟空格或行尾，否则报 "expected a mapping entry"，fail closed（虽比 YAML 规范更严）。
9. **P2 越界进入 P3–P6**——不成立：`readCheckFiles` 仅列目录绑定前缀，无执行；`lib/index.js` 仍是 P1 skeleton，未注册工具/投影/槽位。
10. **P1 安装链被破坏**——不成立：零新增依赖、`exports` 未变、`phases.default.yml` 已列入 `files`、测试脚本向后兼容（`package.json`）。

评审为只读，未修改任何文件。
