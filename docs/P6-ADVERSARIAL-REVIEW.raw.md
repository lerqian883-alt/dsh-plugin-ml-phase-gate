## 结论

**有条件通过** —— 双游标模型、三态渲染、槽位注册与冻结契约一致且未越界 P7，但样式交付机制与 §4 契约字面冲突、渲染层零测试、真实宿主加载链（bundle 配对、primitives API、CSS 变量）全部未经真机验证。

## 发现

**1.（高）内联样式违反契约 §4 的 CSS Modules 条款（字面）**
- 证据：`lib/client.js:93-149`（`dockStyle`/`barStyle`/`popoverStyle` 等全部为 inline `style` 对象）；`docs/CONTRACTS.md:485`：「样式必须经平台模块管线（CSS Modules）并只使用宿主 token」。
- 原因：颜色确实只用宿主 token，无全局 CSS import，但交付机制绕过了平台模块管线，且混入硬编码字面量（`fontSize: 12`、`min(560px, 90vw)`、`zIndex: 20`、`borderRadius: 999`、`width: 14` 等），严格读也违反「只使用宿主 token」。
- 最小修复：二选一——迁移到平台 CSS Modules 管线，或按 P4/P5 先例在 CONTRACTS.md 增加「P6 契约修正」节，显式记录 inline style + token-only 的受控偏离；同时为 `var(--dsh-composer-*)`/`var(--dsw-*)` 加 fallback（如 `var(--x, 0px)`），否则任一变量缺失时整条 `width` 声明 IACVT 失效退化为 `auto`（`lib/client.js:95,103`）。
- 分类：**P6 必须修**。

**2.（高）渲染层零覆盖：三态、popover、badge 均未被测试执行**
- 证据：`test/p6-client.test.mjs` 全文件——`MlPhaseDock` 从未被调用渲染（fake `useState` 在 `test/p6-client.test.mjs:23-26` 定义后从未执行）；无 `undefined`/`null`/对象三态断言；无 popover 开合（`open`/`hover`/`visible`）断言；无 badge 条件（`phase.gap > 0`、`deferred`、`next`）断言；无 `aria-expanded`/`role` 断言（仅有 `test/p6-client.test.mjs:98-104` 的文本正则）。
- 原因：P6 是 UI 阶段，核心交付物是渲染行为；现有测试只覆盖纯函数 `buildRailModel` 和注册形状，恰好绕开了所有 React 逻辑。
- 最小修复：用现有 fake React 直接调用 `MlPhaseDock({useProjection, t})` 三次断言三态输出；调用 `StageRail` 断言 `visible` 初始为 false、badge 出现条件。
- 分类：**P6 必须修**（测试缺口，第 9 项问询的最关键缺口）。

**3.（中）`phase.nextExit` 是死代码，投影契约中不存在该字段**
- 证据：`lib/client.js:234-236` 消费 `phase.nextExit.checks/artifacts/commonPitfalls`；但 `lib/snapshot/codec.js:17-28` 的 `buildSnapshot` 和 `docs/CONTRACTS.md:322-333` 的 `MlPhaseProjection` 均无 `nextExit`——这四行永不渲染。
- 原因：next 阶段的 exit 信息只存在于 `phases.yml`/`ml_phase_phases` 工具输出，不在投影里；快照加字段需 bump `SNAPSHOT_VERSION`/契约。
- 最小修复：删除这四行，或在契约中正式扩展快照（走版本 bump 流程）后接线。不能留死代码假装 popover 展示 checks/artifacts/pitfalls。
- 分类：**P6 必须修**（明确取舍）。

**4.（中）README 与实现矛盾，P6 文档链缺席**
- 证据：`README.md:29-33` 仍写「P6 仍未实现：不注册客户端 UI 槽位」；`README.md:5` 状态停在 P5；`README.md:46` 验证命令不含 p6 测试；`README.md:58-79` 文档列表无任何 P6 文档，而 P1–P5 均有 IMPLEMENTATION-LOGIC/ACCEPTANCE/ADVERSARIAL-REVIEW。
- 原因：文档被当作契约链维护，README 现在主动错误描述当前状态。
- 最小修复：更新 README 状态/未实现节/验证命令，补 P6 文档条目（若项目纪律要求则补文档本体）。
- 分类：**P6 必须修**（低成本文档修正）。

**5.（中）宿主加载链与 API 假设全部未经真机验证，单测桩无法捕捉漂移**
- 证据：bundle id 为包名 `dsh-plugin-ml-phase-gate`（`lib/client.js:2`），而宿主半插件名是 `ml-phase-gate`（`lib/index.js:11`、CONTRACTS §2.1）——若 `__ModuleLoader__` 按插件名配对则加载失败；`package.json:46-52` 的 `dsh.client.inject` 声明 5 个模块但 factory 实际只 `require` 了 `react` + `primitives`（`lib/client.js:8-9`），且 `react` 不在 inject 清单中；`ctx.effect` 把 `locale.register` 的返回值当 disposer（`lib/client.js:268`），`ctx.slots.inject` 自身的销毁器被丢弃（`lib/client.js:269-274`）；`Tooltip`/`StateDot`/`Tag` 的 props（`label/side/portal/delayMs`、`state/appearance/size`、`tone`）是假设 API，测试里是字符串常量桩（`test/p6-client.test.mjs:28-31`）；`useProjection`/`t` 假定由宿主作为 props 注入且无守卫（`lib/client.js:250-252`），`t` 非函数时 `translate` 直接回退显示原始 key（`lib/client.js:60-62`）。
- 原因：这些只能在真实 DSH web 宿主验证；本仓库无法证真或证伪。
- 最小修复：在真机门验证清单中逐项核对；`MlPhaseDock` 加 `typeof useProjection === 'function'` 守卫降级为 null 渲染；单测中用捕获 props 的 fake primitives 至少钉住自己发出的 props 形状。
- 分类：**后续风险**（真机证据门）。

**6.（低）`evidenced = null` 时整段红轨与 `gap = 0` 徽标矛盾**
- 证据：`lib/client.js:66-68,76`——`evidenced` 为 null 时 `evidencedIndex = -1`，则 `0..declaredIndex` 全部命中 `gap` 渲染为红；但契约规定 `evidenced` 为 null 时 `gap = 0`（`docs/CONTRACTS.md:247-248`），故徽标不显示 gap（`lib/client.js:202`），出现「轨道全红 + 无 gap 徽标」。该状态可达：新项目播种首次检查未通过时。
- 原因：轨道红段是从游标推导的视觉量，与权威 `gap` 数字的特殊规则（evidenced null → 0）分歧。
- 最小修复：明确语义——或按推导红段显示徽标，或 `evidenced === null` 时不渲染 gap 红而渲染「未开始证据」的中间态，并在 P6 文档记录。
- 分类：**后续风险**。

**7.（低）`"warning"` 状态分支不可达（可证死代码）**
- 证据：`lib/client.js:76-80`——`declared && !evidenced`（`index === declaredIndex && index > evidencedIndex`）逻辑蕴含 `gap`（`index <= declaredIndex` 恒真），故 `else if (declared && !evidenced) state = "warning"` 永不执行。
- 原因：gap 判定完全覆盖了 declared-未-证实情形；declared 游标实际只靠 `boxShadow` 圆环表达（`lib/client.js:163`）。
- 最小修复：删除该分支或重新定义 warning 语义（如 defer 存在时），并补测试锁定。
- 分类：**后续风险**。

**8.（低）硬编码几何值与层级可能被宿主裁剪/压层**
- 证据：`lib/client.js:138`（`width: "min(560px, 90vw)"` 贴边节点会水平溢出 composer）、`lib/client.js:146`（`zIndex: 20` 硬编码）、`lib/client.js:103`（`4 * var(--dsh-composer-dock-inset)` 假设变量为长度值）。
- 原因：宿主 composer 若有 `overflow: hidden` 或更高堆叠层，popover 会被裁剪或压底；缩放/密度主题下固定 px 不跟随。
- 最小修复：真机视觉走查 + 必要时改用宿主 z-index/尺寸 token。
- 分类：**后续风险**（真机视觉门）。

**9.（低）`exports["./client"]` 无 `types` 条件；`__test` 出厂；测试数据不合 schema**
- 证据：`package.json:18-20`（无 types）；`lib/client.js:279`（`exports.__test` 随生产 bundle 发货）；`test/p6-client.test.mjs:62`（`{ id: 'M1' }` 缺 `name`，违反 `lib/projection/schemas.js:23` 自家 schema）。
- 最小修复：补 `types` 或声明无类型；`__test` 移到条件分支或接受其存在并记录；测试数据补 `name`。
- 分类：**后续风险**（清理级）。

## P6 必须修

1. 样式交付与契约 §4 的冲突：迁移 CSS Modules 管线或补「P6 契约修正」节，并为所有 `--dsh-*`/`--dsw-*` 变量加 fallback（发现 1）。
2. 补渲染层测试：`MlPhaseDock` 三态、popover 开合、badge 条件、关键 aria 属性（发现 2）。
3. `phase.nextExit` 死代码：删除或走快照契约扩展，二选一落定（发现 3）。
4. README 状态、未实现清单、验证命令与 P6 实现对齐（发现 4）。

## 后续风险

1. 真机加载链：bundle id（包名 vs 插件名）与宿主半配对、`dsh.client.inject` 清单与实际 require 的出入、`ctx.effect`/`ctx.slots.inject` 销毁器语义（发现 5）。
2. `Tooltip`/`StateDot`/`Tag` props API 与 `useProjection`/`t` 注入方式为假设，需真机验证并加守卫（发现 5）。
3. `evidenced = null` 时全红轨道与 `gap = 0` 徽标的语义分歧（发现 6）。
4. `"warning"` 分支不可达，declared 游标仅靠圆环表达，意图需确认（发现 7）。
5. popover 溢出裁剪、`zIndex: 20`、固定 px 在宿主主题下的表现（发现 8）。
6. `./client` 无 types、`__test` 发货、测试数据缺 `name`（发现 9）。

## 误报

1. 「客户端重新计算 evidenced/gap」——`buildRailModel`（`lib/client.js:64-83`）只做投影字段→节点视觉位的映射，`evidenced`/`gap`/`next` 数值全部直接取自投影，未读盘、未跑检查、未重算判定引擎逻辑；符合 §4 第 489 行约束。
2. 「`MlPhaseDock` 提前 return 违反 Hooks 规则」——该组件自身不调用任何 hook，`useState` 在独立的 `StageRail` 组件内（`lib/client.js:180-183`），早退合法。
3. 「`DetailRow` 以普通函数调用而非组件、`details` 中混入 `null` 子节点有问题」——`DetailRow` 是纯元素工厂无 hooks，React 对 null 子节点合法忽略（`lib/client.js:173-178, 229-238`），无运行时风险。
4. 「破坏 P0–P5 契约或安装链」——`lib/index.js` 未改动；`package.json` 变更均为增量（新增 `./client` export、`dsh.client`、`test:p6`）；`files` 已含 `lib` 故 client.js 随包发货；无新增依赖。未发现破坏。
