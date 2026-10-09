评审完成。除指定的 11 个文件外，我还核对了 `lib/types/contracts.d.ts`、`docs/CONTRACTS.md`、`docs/ARCHITECTURE.md`，并实读了文档声称的两个宿主先例（`dsh-whale-widget` 的 package.json / cordis.patch.yml / lib/index.js 头部，`@deepseek-ai/dsh-tool-todo` 的 package.json）来证伪安装链假设。注意：本评审环境只读、无执行工具，`node --test` 未独立复跑；测试计数按文件核对为 P0=10 + P1=9 = 19，与 `docs/P1-ACCEPTANCE.md` 记录一致。

## 结论

有条件通过 — 骨架、导出形状、patch 形状与已核实的在跑先例一致且未越 P1 边界，但 `requireSafeRelativePath` 存在 Windows 盘符相对路径绕过、P1“零注册”边界缺测试锁定，两者须在 P1.6 真机安装验证前闭合。

## 发现

**1.（高）`requireSafeRelativePath` 放过 Windows 盘符相对路径，逃逸校验可被绕过**
- 证据：`lib/config.js:48` 的绝对路径判定 `/^[A-Za-z]:[\\/]/` 要求冒号后必须跟分隔符；`lib/config.js:55-60` 的分段检查也不拒绝 `C:` 开头的段。因此 `verifyCommand: 'C:tmp\\x.cmd'` 或 `'C:'` 能通过全部校验。
- 原因：`C:` 开头但无 `\`/`/` 的路径是 Windows 盘符相对路径，`path.win32.resolve(projectRoot, 'C:x')` 的结果落在 C: 盘（盘根或该盘 cwd），不在项目根内。P0 契约（`docs/CONTRACTS.md` §2.2）要求 `verifyCommand` 解析后不得逃逸项目根，而 P1 的核心交付之一就是这个校验；P2/P3 的解析器将直接建在其上，漏洞会传播。测试（`test/p1-skeleton.test.mjs:92-97`）只覆盖了 `C:\\outside`、`../`、`/etc/passwd`，恰好没覆盖这个分支。
- 最小修复：把判定改为 `/^[A-Za-z]:/`（任何盘符限定即拒绝），并补测试：`'C:tmp\\phases.yml'`、`'C:'`、`'C:x'` 三例。
- 分类：**P1 必须修**。

**2.（中）P1“不注册任何资源”边界没有任何测试锁定**
- 证据：`test/p1-skeleton.test.mjs` 全部 9 项中没有一项断言 `apply` 不调用 `ctx.tool` / `ctx.projection` / `ctx.on` / `ctx.slots` / `ctx.inject` 等宿主注册面。
- 原因：“P1 不注册工具、投影、注入、客户端 UI”是本次评审的核心不变量之一，目前只靠代码目检成立（`lib/index.js` 确实只调 `logger` 和 `effect`）。没有负向测试，P2 开发中一旦有人提前挂资源，P1 回归测试不会红。
- 最小修复：加一项测试——传入带 spy 的伪 ctx（`tool/projection/on/slots/inject` 全部记录调用），执行 `apply` 后断言零调用。
- 分类：**P1 必须修**。

**3.（中）`ctx.effect` 缺失时的降级丢弃 disposer，且静默吞掉坏宿主**
- 证据：`lib/index.js:60` 直接 `setup();`，返回的 disposer 被丢弃；`lib/index.js:25-27` 的 `contextOf` 使 `apply(null, {})` / `apply(fn, {})` 静默“成功加载”。
- 原因：P1 内 disposer 只打日志，无实际资源，此刻无害，也不违反真实 DSH 生命周期（真实 Cordis ctx 必有 `effect`，先例 whale-widget 也以 `root.effect` 为生命周期边界，见 `dsh-whale-widget/lib/index.js:612`）。但 `lib/index.js:6` 注释明言“Later phases attach their resources to the lifecycle effect established here”——一旦后续阶段在 fallback 路径挂了定时器/监听器，最小 loader 下将不可回收；同时静默降级与 P0 的 fail-loud 哲学（`docs/CONTRACTS.md` §3）相悖，可能掩盖宿主接线错误。
- 最小修复：P2 挂载任何真实资源前，fallback 分支必须先硬化（打 `logger.warn` 或直接抛错，仅保留单测路径）；P1 至少在文档/注释里把 fallback 标注为 test-only。
- 分类：**后续风险**（P1 内无实害）。

**4.（低）`config: {}` 键未获先例直接背书**
- 证据：本包 `cordis.patch.yml:17` 写了 `config: {}`；先例 `dsh-whale-widget/cordis.patch.yml:13-15` 的 insert 条目只有 `id` + `name`，没有 `config` 键。
- 原因：insert 条目是否接受 `config` 键无法从先例确证（大概率合法——插件条目通常可带 config），静态审查到此为止。
- 最小修复：无需改文件；把它列为 P1.6 `--dump-config` 的显式验证点（确认条目出现且 shape 正常）。
- 分类：**后续风险**（并入 P1.6 验证清单）。

**5.（低）`PACKAGED_DEFAULT_PHASES_FILE` 指向不存在的文件，且不在 `files` 白名单**
- 证据：`lib/contracts.js:26` 冻结了 `'phases.default.yml'`；包根目录该文件不存在（读取确认）；`package.json:20-25` 的 `files` 只含 `lib/docs/cordis.patch.yml/README.md`。
- 原因：P1 无消费者，不算缺陷；但 P2 引入默认阶段定义时若只加文件不加 `files`，link: 安装能跑、打包分发即缺件（且 `private: true` 目前也使发布不可用，见发现 7）。
- 最小修复：P2 交付默认 phases 文件时同步补 `files` 条目并加存在性测试。
- 分类：**后续风险**。

**6.（低）冻结的 default export 与真实 loader 的兼容性未经真机确证**
- 证据：`lib/index.js:63-67` 导出 `Object.freeze({ name, inject, apply })`。先例 whale-widget 的 default 是未冻结对象（`dsh-whale-widget/lib/index.js:602-610`），官方 `dsh-tool-todo` 走 named exports。
- 原因：Cordis `ctx.plugin` 对插件对象是读消费，冻结大概率无害；但若宿主 loader（如 `@deepseek-ai/cordis-plugin-loader`）对插件对象做 HMR/重载注记，冻结对象在严格模式下会抛错。双导出（named + default）形状本身与两种先例都对齐，静态层面成立。
- 最小修复：P1.6 真机安装时确认插件加载日志出现且无 TypeError；若报冻结相关错误，去掉 default 上的 `Object.freeze`（named exports 仍冻结）。
- 分类：**后续风险**（并入 P1.6 验证清单）。

**7.（低）`private: true` 与未来分发冲突；无 `engines` 声明**
- 证据：`package.json:4`、`package.json` 无 `engines` 字段；测试用 `import.meta.dirname`（`test/*.mjs:9`）需 Node ≥ 20.11。
- 原因：`link:`/`file:` 安装不经过 publish，private 不阻塞本地安装链（已证伪为阻塞项）；仅在将来以 npm/tarball 分发时需要移除。`engines` 缺失只是环境提示缺失。
- 最小修复：分发时移除 `private`；可顺手声明 `"engines": { "node": ">=20.11" }`。
- 分类：**后续风险**。

**8.（低）安装链文档路径与本评审工作目录不同源，存在版本漂移窗口**
- 证据：`docs/P1-IMPLEMENTATION-LOGIC.md:173` 与 `README.md:34` 的 link 安装路径指向 `<dsh-workspace>\.dsh\plugins\ml-phase-gate`，而本次评审对象位于 `<workspace>\ml-phase-gate-p1`；仓库内无证据证明两者同源同步。
- 原因：若 P1.6 安装的是旧拷贝，评审结论与真机运行的代码可能不一致。
- 最小修复：P1.6 安装时以加载日志中的 `dsh-plugin-ml-phase-gate@1`（`lib/index.js:41` 格式含 CONTRACT_VERSION）确认运行的就是评审版；或在文档记录两目录的同步关系。
- 分类：**后续风险**。

## P1 必须修

1. **修复 `requireSafeRelativePath` 的盘符相对路径绕过**（发现 1）：`/^[A-Za-z]:/` 全拒绝 + 三条新测试（`'C:tmp\\phases.yml'`、`'C:'`、`'C:x'`）。
2. **补 P1 边界负向测试**（发现 2）：伪 ctx spy 断言 `apply` 零注册（tool / projection / on / slots / inject）。

（P1.6 真机安装/卸载/再安装与 `--dump-config` 回填本身仍是未闭合的验收门，属既有计划，不计入新增发现。）

## 后续风险

1. `ctx.effect` 缺失的 fallback 丢弃 disposer 且静默降级——P2 挂载真实资源前必须硬化或移除（发现 3）。
2. `config: {}` 键是否被宿主接受未获先例背书——列入 P1.6 `--dump-config` 验证点（发现 4）。
3. 冻结 default export 的 loader 兼容性——P1.6 真机加载时确认无冻结相关 TypeError（发现 6）。
4. `PACKAGED_DEFAULT_PHASES_FILE` 无文件、不在 `files`——P2 交付默认阶段文件时同步补（发现 5）。
5. `private: true` 阻塞未来 npm 分发；建议补 `engines: node >=20.11`（发现 7）。
6. 安装文档 link 路径与评审副本目录不同源——P1.6 用加载日志版本行核对运行版本（发现 8）。

## 误报

1. **原型污染 / `__proto__`、`constructor` 注入** — 证伪：对象字面量 spread 用 define 语义不会改原型；`lib/config.js:99-103` 对 `Object.keys` 的未知键全部拒绝（`'__proto__'`、`'constructor'` 都不在白名单）；且 `lib/config.js:111-118` 输出对象按 6 个字段显式重建，任何多余属性（含非枚举属性）都无法泄入返回值。
2. **不可枚举属性绕过未知键检查** — 证伪：即使逃过 `Object.keys` 检查进入 `merged`，输出重建只取白名单字段，非法值仍会过各自校验器，未知字段无出口。
3. **`inject = []` 违反 Cordis 契约或导致永不加载** — 证伪：空注入是无条件满足，不是永不满足；先例 whale-widget v758 甚至刻意移除对象级 `inject` 以避免 apply 被推迟（其 lib/index.js:604-609 注释）。P1 不依赖任何服务，`inject=[]` 正确且符合边界。
4. **exports/types 解析缺陷** — 证伪：`main` 与 `exports['.'].default` 指向同一文件（`package.json:7,12`）；两个子路径的 `types` 条件都在首位；`./package.json` 已导出；`lib/index.d.ts:5` 的 `./types/contracts` 相对解析正确落在 `lib/types/contracts.d.ts`（已实读存在）。
5. **`private: true` 会阻塞 `link:` 安装** — 证伪：private 只拦 `npm publish`，link:/file: 协议不经过 publish；仅影响未来分发（已归入后续风险 5）。
6. **P0↔P1 契约漂移** — 证伪：包名/插件名/版本、`DEFAULT_CONFIG` 六键六值、错误码全集、工具名、19 项测试计数（P0=10+P1=9）与 `docs/CONTRACTS.md` 及 P0 测试逐一相符；`phases.default.yml` 的缺位属 P2 计划内延后（已归入后续风险 4）。
7. **`../`、UNC（`\\server`）、设备命名空间（`\\?\`）、NUL 逃逸** — 证伪：`lib/config.js:46-52` 对 UNC/设备前缀（`^[\\/]{2}`）、POSIX 绝对、`C:\` 形式、NUL、空段/`.`/`..` 段的拒绝均正确且被测试覆盖；唯一实漏洞是发现 1 的盘符相对形态。
8. **`id: ml-phase-gate` 不会解析到本包** — 证伪（按先例）：whale-widget 的 insert 中 `name` 是解析包名的键（等于其包名），`id` 是配置树实例键（该例中 id 恰好等于包名，但与插件导出名 `whale-balance-widget` 不同，证明 id 不参与包解析也不必等于导出名）；本包 `name: dsh-plugin-ml-phase-gate` 与包名严格一致，`id` 在 profile 内唯一。残余不确定性与 `config:` 键一并留给 P1.6 dump-config 复核（后续风险 2）。

P1 未越界（无工具/投影/注入/客户端代码，无 I/O，无依赖），亦无遗漏的必要骨架——唯一遗漏的是上面两条必须修的验证缺口。修完 1、2 并跑过 P1.6 真机链后，P1 可关闭。
