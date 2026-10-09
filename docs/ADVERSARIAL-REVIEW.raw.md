评审完成。我读取了全部 9 份交付物，并对照本机已安装宿主（`dsh-session-projection`、`dsh-client-ui-conversation` 的 slots 契约、`dsh-time-context`、`dsh-client-ui-goal` 两个先例）核验了 P0 对宿主事实的声明。说明一点：本环境禁止进程派生（Glob/Bash 均 EPERM），`node --test` 无法实际执行，测试通过与语法检查只能做静态核读，未运行验证。

先说核验为真的宿主事实（这些是评审的地基）：
- `conversation.input.dock` 确实存在，`kind: 'list'`、`scope: 'session'`（slots.d.ts:214-218）；goal 先例注册形状与 P0 §4 完全一致，且 `order: 10`（goal/client.js:557-561），`order: 5` 落点成立。
- `user/message` 携带 `data.source.kind` 的桥接先例成立（time-context 的 `apply` 正是检查 `event.data.source.kind === name`）；整值事件、"不关心事件返回同一引用"、纯同步 fold 的表述与宿主 `ProjectionDefinition` 文档逐条吻合。
- goal 先例的投影三态（`undefined | null | object`）消费方式与 P0 §4 一致。

在此基础上，以下是证伪结果。

## 结论
**有条件通过**：宿主事实核验全部对上、架构分层与 D-001~D-008 自洽，但冻结稿存在九个 P0 范围内的契约缺口（快照空态不可表达、投影缺阶段序列、证据执行接口三文档互相矛盾、defer 与迁移语义未闭合等），须以文档/类型/测试最小修复后重冻结并回填验收。

## 发现

- [严重度: major] 快照/投影类型无法表达"已定义的 declared=null 状态"，播种前置条件未冻结
  - 证据：`lib/types/contracts.d.ts:120-130` `MlPhaseSnapshot.phaseId: PhaseId`（非空 string）、`index: number`；`docs/CONTRACTS.md` §2.7 `declared` 语义"无状态时为 null"；`docs/ARCHITECTURE.md` §6.1 播种流程未写"仅当 state.json 存在才构造快照"。
  - 原因：`PhaseEvaluation` 明确定义了无状态项目（declared=null、evidenced=null、next=M0），按 §6.1 流程它必须被转成 `MlPhaseSnapshot`，但冻结类型装不下。存在一个自洽读法（无 state.json 就永不播种，投影停在 null 即"未开始"），但该规则没有写进任何文档；两种读法对 P5 播种逻辑和 P6 "null=未开始"渲染给出不同实现。
  - 最小修复：在 CONTRACTS §2.8 写明播种前置条件（例如"仅当 declared 非空才追加快照"），或将 `phaseId/index` 改为可空并定义 `index` 的空值。二选一，一段话即可。
  - 分类：P0 必须修

- [严重度: major] 投影不携带阶段序列，"九点轨道"与"项目可覆盖阶段"互相矛盾
  - 证据：`docs/CONTRACTS.md` §2.4"id 默认 M0–M8，项目可覆盖"；§2.9 `MlPhaseProjection` 只有 `phaseId/index/evidenced/next`，无阶段列表；`docs/ARCHITECTURE.md` §5.2 客户端"渲染九点阶段轨道"、§5.3 客户端禁止读盘和推导业务。
  - 原因：客户端被禁止读 phases.yml，又被要求渲染轨道。项目自定义阶段 id 或数量后，`index` 在客户端不可解释（不知道序列），自定义 id 连标签都没有。现在补字段是免费动作；P6 之后补则要 bump SNAPSHOT_VERSION 和 PROJECTION_VERSION 双版本——正是冻结稿要防的破坏性变更。
  - 最小修复：P0 内裁决其一——投影增加 `phases: string[]`（或 id+name 列表），或明文冻结"Dock 只渲染默认 M0–M8 轨道，自定义阶段仅体现在 phaseId 文本"。
  - 分类：P0 必须修

- [严重度: major] 证据执行接口三文档矛盾且未冻结：`work/checks/*.ps1` vs `work/verify.cmd`
  - 证据：`docs/ARCHITECTURE.md` §3"work/checks/*.ps1 阶段出口的可执行证据"；`docs/IMPLEMENTATION-LOGIC.md` §5.3"检查执行器调用项目自己的 work/verify.cmd"；`docs/CONTRACTS.md` §2.6 `CheckResult` 是每检查粒度（独立 exitCode/stdout/stderr）；§6.2 advance 要"只运行目标阶段的出口检查"；§2.2 `verifyCommand` 既无默认值也无校验规则。
  - 原因：单一入口 `verify.cmd` 与每检查粒度的 `CheckResult` 之间缺一整层契约：谁调用谁、按阶段/检查名如何过滤、verify.cmd 的输出如何解析映射为逐条 CheckResult。P3 无法据此实现，advance 的"只跑目标阶段"也无从落地。这是 P0 三份文档间最实质的互相矛盾。
  - 最小修复：在 CONTRACTS 增加一小节冻结执行边界（如：插件直接按前缀调用 `work/checks/NNN-*.ps1`，verify.cmd 仅为项目自用入口；或 verify.cmd 接受阶段过滤参数并输出约定格式），并给出 verifyCommand 的默认值与校验规则。
  - 分类：P0 必须修

- [严重度: major] 投影注册缺 zod 双 schema 契约，O12 的处置没有覆盖这个硬性要求
  - 证据：宿主 `dsh-session-projection/lib/types/index.d.ts` `ProjectionDefinition.stateSchema: ZodType<S>` 为必填、客户端可见注册重载要求 `wire: { viewSchema, view }` 必填；先例 time-context 注册即带 `stateSchema: z$1.object(...)`。`docs/CONTRACTS.md` §2.9 投影契约通篇无 schema 字样；`docs/P0-ACCEPTANCE.md` O12 只讨论"zod 第二副本"问题。
  - 原因：P0 冻结了 wire 形状，却没有冻结"注册必须提供与 interfaces 一致的 stateSchema + viewSchema"这一事实。P5 要么临场补两份 zod schema（与 .d.ts 的漂移无人看管、P0 测试测不到），要么根本注册不上。这是会导致 P5 卡死或静默漂移的缺口。
  - 最小修复：在 CONTRACTS §2.9/§5 各加一句：注册 mlPhase 必须提供与 `MlPhaseProjection` 一致的 stateSchema 与 viewSchema（nullable 以支持 init=null），并把 schema 归属写进 O12 的后续处理。
  - 分类：P0 必须修

- [严重度: major] defer 语义不闭合：效应、scope、by 来源、解除路径全部未定义
  - 证据：`docs/CONTRACTS.md` §2.10 defer 输入仅 `{reason, scope?}`；§3 `E_DEFERRED` 含义"输入无效**或当前被 defer**"；`lib/types/contracts.d.ts:67-72` `DeferRecord.by` 必填但无来源；工具面四件套（§2.10、contracts.js TOOL_NAMES）无解除 defer 的操作；defer 对 advance、对 evidenced 回退红标的影响全文未提。
  - 原因：defer 是 D-007"人工覆盖必须可见"的核心机制，但冻结稿只冻结了"写一条记录+UI 显示"，没冻结 defer 到底豁免什么。`by` 必填却没有任何输入能填它；一旦 defer 生效且只能靠 advance 成功解除，而 advance 又可能被 defer 自身或检查挡住，就没有契约内出路。
  - 最小修复：一段话定义：defer 是否阻止/放宽 advance、scope 的取值语义、`by` 由宿主侧（agent/用户身份）填充而非工具输入、defer 随下一次成功 advance 自动清除并写入 history（或补第五个工具）。
  - 分类：P0 必须修

- [严重度: major] `ml_phase_advance.to` 的合法迁移集合与回退路径未定义
  - 证据：`docs/CONTRACTS.md` §2.10 输入 `"to": "M4"` 无约束说明；§2.7 定义了 next/gap 但没定义 to 与它们的关系；`HistoryEntry.from` 允许任意值；全文无"回退/返工"语义。
  - 原因：ML 流程中"回到 M2 重做特征"是常态需求。若 `to` 任意且要求目标阶段出口检查通过，则返工场景（早期检查因项目演进而失效）会被闸门永久锁死——declared 只能前进。跳阶段（M1→M4）是否合法也未裁决，直接影响 gap 与 next 的语义。
  - 最小修复：在 §2.10 写明合法迁移（如：to ∈ {declared+1} ∪ 回退目标，回退不要求目标检查通过但必须记录原因），一段话。
  - 分类：P0 必须修

- [严重度: major] "投影过期"判定未定义，且 `updatedAt/checkedAt` 使任何内容等价判定永不成立
  - 证据：`docs/ARCHITECTURE.md` §6.1"若投影过期，追加一条 user/message"；`docs/CONTRACTS.md` §2.8 `updatedAt`、§2.7 `checkedAt` 均为必填时间戳；宿主投影以 `Object.is` 比较发布。
  - 原因：过期谓词没有定义，唯一可推断的实现是"快照内容变化才追加"，但载荷内含每次必变的时间戳，等价判定恒为 false → 每个 agent 步都追加一条快照消息（会话日志与模型上下文按步增长），宿主侧每次 fold 都产生新引用触发发布。谓词歧义会直接造成 P5 两种行为分叉。
  - 最小修复：定义过期判定为"忽略 updatedAt/checkedAt 的内容等价"，或规定固定节流下每步必注入并删掉"若投影过期"的条件表述。
  - 分类：P0 必须修

- [严重度: major] `ml_phase_status.projectRoot` 接受任意绝对路径，构成任意目录脚本执行面，且无威胁模型
  - 证据：`docs/CONTRACTS.md` §2.10 输入 `{ "projectRoot": "optional absolute path" }`，无校验规则；§2/§5.1 evidenced 每次"现跑 work/checks"。
  - 原因：status 会执行目标根下的项目脚本。模型侧把 projectRoot 指向任何目录即在该目录执行其 `*.ps1`/`.cmd`。P0 冻结了工具输入形状却不冻结其约束，等于把越界执行留给 P4"习惯决定"。
  - 最小修复：冻结一条校验规则（如 projectRoot 必须等于 SessionHeader.cwd 解析出的项目根，或其祖先/已确认工作区），并把"检查执行=运行项目自有代码，授权边界同 shell 工具"写为一句威胁模型。
  - 分类：P0 必须修

- [严重度: major] 契约测试未覆盖多数已冻结不变量，防漂移目标（§6）落空
  - 证据：`test/p0-contracts.test.mjs:42-48` 仅断言 11 个错误码中的 2 个；全文件无 TOOL_NAMES 断言；`:50-58` 只测 DEFAULT_CONFIG 冻结不测其值（120000/5000/两个路径常量）；`docs/IMPLEMENTATION-LOGIC.md` §4.1 自列的不变量 `SNAPSHOT_SOURCE_KIND === PLUGIN_NAME` 未测；CONTRACTS §6 声称 js 与 d.ts"必须保持一致"但无任何机器检查。
  - 原因：P0 测试的全部价值就是契约回归保护，当前约六成冻结面裸奔：改错一个错误码字符串、删一个工具名、改 checkTimeoutMs 默认值都不会红。
  - 最小修复：补断言（ERROR_CODES 全集、TOOL_NAMES、DEFAULT_CONFIG 全值、kind===plugin 名联动）；d.ts 一致性可先以"文件包含各字面量"的弱检查兜底。纯测试改动，P0 范围内。
  - 分类：P0 必须修

- [严重度: minor] `Blocker.check` 对工件型阻断语义不明
  - 证据：`lib/types/contracts.d.ts:101-106` `check` 必填 string；`docs/CONTRACTS.md` §3 有 `E_ARTIFACT_MISSING`。
  - 原因：缺工件时没有检查名可填，也没有 `kind: 'check'|'artifact'` 判别，UI 工具卡无法区分两类阻断。
  - 最小修复：加 `kind` 字段或允许 `check` 为空串并注明语义。
  - 分类：P0 必须修

- [严重度: minor] `gap`/`index` 在 null 或未知 id 下未定义
  - 证据：`docs/CONTRACTS.md` §2.7 `gap = max(0, index(declared) - index(evidenced))`，declared/evidenced 均可为 null；state.json 声明的 id 不在 phases.yml 中时的行为无规定。
  - 原因：`index(null)` 与 `index(未知)` 无定义，判定引擎纯函数无法闭合。
  - 最小修复：一句话：declared 或 evidenced 为 null 时 gap=0；declared 未知 id 报 `E_PHASES_INVALID`（或 E_STATE_CORRUPT，需指明）。
  - 分类：P0 必须修

- [严重度: minor] 工具输出 schema 用空对象占位，引用类型未指明
  - 证据：`docs/CONTRACTS.md` §2.10 advance 输出 `"state": {}, "evaluation": {}`、phases 输出 `"next": {}`、defer 输出"审计记录"无结构。
  - 原因：§1 声称冻结"四个工具的名字与输入输出"，但输出侧只冻结名字不冻结形状，P4 与 P6 工具卡各自想象。
  - 最小修复：注明引用类型（state→ProjectState、evaluation→PhaseEvaluation、next→PhaseDefinition|null、defer 审计记录→DeferRecord+HistoryEntry）。
  - 分类：P0 必须修

- [严重度: minor] 检查前缀匹配规则有歧义；版本严格相等的 fail-closed 意图未写明
  - 证据：`docs/CONTRACTS.md` §2.4 "exit.checks 是检查名前缀"、"必须等于 PHASES_VERSION"。
  - 原因：前缀包含关系（"01"匹配"010-*.ps1"和"011-*.ps1"）使一个脚本可被多个阶段共享且无禁止规则；version 严格相等会把未来版本项目挡在门外，方向正确但应写明是有意 fail-closed 及对应错误码。
  - 最小修复：规定前缀按 `NNN-` 整段匹配并禁止跨阶段共享（或允许并写明）；版本不等时映射 E_PHASES_INVALID 写明意图。
  - 分类：P0 必须修

- [严重度: minor] `stateVersion` bump 规则比宿主窄；PROJECTION_VERSION 无宿主消费者
  - 证据：`docs/ARCHITECTURE.md` §11"fold 语义变化必须 bump stateVersion"；宿主定义是"serialized state fields **或** fold 语义变化"；`docs/CONTRACTS.md` §5 的 PROJECTION_VERSION 在宿主中无对应槽位（wire 由 viewSchema 承载）。
  - 原因：state 形状变化若不 bump，靠 stateSchema 兜底但违反宿主契约本意；PROJECTION_VERSION 是自造常量，三版本职责（state/snapshot/projection）大体清晰，但这两处会让 P5 执行者困惑。
  - 最小修复：§11 补"state 字段形状变化也必须 bump"；注明 PROJECTION_VERSION 仅作文档级记录、无运行时消费。
  - 分类：P0 必须修

- [严重度: minor] "不直接 import CSS"与官方 dock 先例冲突
  - 证据：`docs/CONTRACTS.md` §4、`docs/IMPLEMENTATION-LOGIC.md` §5.6"不 import CSS"；先例 `dsh-client-ui-goal/lib/client.js:128-148、437-451` 的 dock 组件就是平台 `dsh-css:` 管线编译的 CSS Modules（注入 `<style>`，内部全用宿主 token）。
  - 原因：按字面执行 P6 只能用内联样式，或被迫违反冻结规则；规则本意应是"只能经平台种子模块管线"。
  - 最小修复：改写为"样式必须经平台模块管线（CSS Modules）且只使用宿主 token，禁止任意全局 CSS import"。
  - 分类：P0 必须修

- [严重度: risk] stdout/stderr 无截断上限，history 无界增长，且 state.json 规定入 git
  - 证据：`docs/CONTRACTS.md` §2.3"state.json 属于审计资产，应当进入 git"、§2.6"原始 stdout/stderr 必须保留"、§2.5 history 数组。
  - 原因：一条多话的检查即可让 state.json 膨胀到不可 diff；每次迁移都追加完整 evidenceSnapshot，长项目无界增长，git 合并冲突频繁。
  - 最小修复：P0 不必实现，但应在 §2.6 加一句"保留输出必须截断到冻结上限"，把具体上限留给 P3。
  - 分类：后续风险

- [严重度: risk] 检查执行即运行项目代码，无沙箱与授权边界说明
  - 证据：`docs/CONTRACTS.md` §2.3"work/checks 由项目拥有，插件只调用"；全文无沙箱、cwd、环境变量、网络约束。
  - 原因：与 projectRoot 修复相关的另一半：即使根受限，项目内脚本本身是任意代码；P3 需要一份执行边界声明，否则审计无从谈起。
  - 最小修复：P0 写一句威胁模型（见 projectRoot 条），细节 P3 落实。
  - 分类：后续风险

- [严重度: risk] `mlPhase` 如何进入宿主投影类型表未列入 P5 检索清单
  - 证据：宿主 `ProjectionDefinition<K extends keyof SessionProjectionStateMap>` 要求 key 已在类型表中，需要 `declare module` 增强；`docs/P0-ACCEPTANCE.md` O11/O12/O17 均未覆盖。
  - 原因：P5 实现时会撞上类型增强或强制转换的选择，宜有记录项。
  - 最小修复：在未决问题表加一行（O19）。
  - 分类：后续风险

- [严重度: risk] 并发会话下写锁与 `E_WRITE_CONFLICT` 的恢复策略、`preStepThrottleMs` 作用域未定义
  - 证据：`docs/ARCHITECTURE.md` §6.2"获取项目级写锁"；`docs/CONTRACTS.md` §2.2、§3。
  - 原因：同一项目两个 harness 会话同时 pre-step 播种/推进时，冲突方是重试、放弃还是报给用户，节流是按进程、会话还是项目计，都影响 P2/P5 行为一致性。
  - 最小修复：P0 加两句语义（作用域=项目根；冲突=fail loud 返回 E_WRITE_CONFLICT 不自动重试），实现留后续。
  - 分类：后续风险

- [严重度: risk] 预步全量证据扫描的最坏成本未约束
  - 证据：`docs/CONTRACTS.md` §2.2 checkTimeoutMs=120000/检查；evidenced 每次现跑；preStepThrottleMs=5000 只限频率。
  - 原因：多阶段多检查时单个 agent 步可能被分钟级阻塞；节流挡不住单次时长。
  - 最小修复：记为 P3 设计约束（如 pre-step 只跑增量或异步刷新），P0 不修。
  - 分类：后续风险

- [严重度: risk] 宿主基准是 rc 版（0.1.7-rc.2），无宿主升级回归验收项
  - 证据：`docs/ARCHITECTURE.md` 头部基准声明；slots/projection 契约在 rc 阶段仍可能变动。
  - 原因：已核实的宿主事实可能随 rc 演进失效；P0 冻结稿引用的具体 .d.ts 行为没有版本护栏。
  - 最小修复：未决问题加一行"宿主升级时重跑本评审的宿主核验清单"。
  - 分类：后续风险

## P0 必须修
1. 定义快照空态：播种前置条件或改 `phaseId/index` 可空（发现 1）。
2. 投影补阶段序列或冻结"仅默认轨道"裁决（发现 2）。
3. 统一并冻结证据执行边界：`*.ps1` 直调还是 `verify.cmd`、过滤参数、结果映射、verifyCommand 默认值（发现 3）。
4. 投影契约补 stateSchema/viewSchema 强制要求并更新 O12（发现 4）。
5. 补 defer 语义段：效应、scope、by 来源、解除路径（发现 5）。
6. 补 advance 合法迁移与回退规则（发现 6）。
7. 定义"投影过期"谓词并处理时间戳字段的等价性（发现 7）。
8. 冻结 projectRoot 校验规则与一句执行授权威胁模型（发现 8）。
9. 补契约测试断言：ERROR_CODES 全集、TOOL_NAMES、DEFAULT_CONFIG 全值、kind===PLUGIN_NAME（发现 9）。
10. 六个小项各一句话：Blocker.check 语义、gap/index 空值、工具输出引用类型、前缀匹配规则、stateVersion 补写、CSS 规则改写（发现 10–15）。
11. 回填 `docs/P0-ACCEPTANCE.md` §3.1–3.4 验收结果；本评审即 §3.4 的输入，需把本结论记入 `docs/ADVERSARIAL-REVIEW.md` §3 处置表。注意：本环境无法派生进程执行 `node --test`/`node --check`，测试通过与语法检查需在可执行环境中实际跑过再回填，不得凭静态阅读填"通过"。

## 后续风险
1. stdout/stderr 截断上限与 history 增长控制（P3，P0 可先加一句截断要求）。
2. 项目脚本执行的沙箱/授权边界细节（P3）。
3. `mlPhase` 键的模块类型增强路径（P5，建议记 O19）。
4. 并发会话写冲突恢复策略与节流作用域（P2/P5）。
5. 预步全量扫描的最坏延迟（P3 设计约束）。
6. rc 宿主基准的升级回归护栏（流程项）。

## 误报或不建议在 P0 修
1. "测试只验证常量、没验证关键不变量"作为整体批评不成立——P0 无业务逻辑可测，验证常量正是其职责；真问题是常量覆盖不全（发现 9 已列），不是不该测常量。
2. O11/O12/O17 的推迟裁决合理，且本次已核实 `createUserMessage` 确实来自 `@deepseek-ai/dsh-llm`（time-context 先例在用），推迟有据，不必在 P0 收紧。
3. SNAPSHOT_VERSION 与 PROJECTION_VERSION 对两个字节相同形状的冗余无害，不必在 P0 合并，只需按发现 14 注明职责。
4. `PACKAGED_DEFAULT_PHASES_FILE` 指向尚不存在的 `phases.default.yml`——这是 P2 交付物，不是 P0 缺陷。
5. 核查通过项（用户清单 #7、#5）：未发现 P0 越界进入 P1——package.json 无 main/exports，contracts.js 纯常量无副作用；客户端半无业务重算通道——gap/evidenced 均由投影整值下发，index 仅用于呈现。"todo(0)/queue 占位"未逐一核实（goal=10 已核实），不足以构成发现。
