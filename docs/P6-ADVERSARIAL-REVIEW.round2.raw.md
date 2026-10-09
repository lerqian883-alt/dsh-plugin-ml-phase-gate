# P6 第二轮对抗式评审（只读）

**取证方式说明**：全程静态核验 + grep 取证；`node --test` 执行被当前权限模式拒绝，故“测试通过”仅为实现方声明，未经本轮复核。

## 结论

**有条件通过。** 四个必修项中 1、2、3 已闭合且经得起证伪；必修项 4 主体闭合但留一个收尾缺口（README 引用两份尚不存在的 P6 文档）。未发现新的代码级 P6 blocker；唯一新增问题是该文档链缺口（低）。真机风险清单与首轮基本一致，P6 修复未消解任何真机项。

## 四个必修项逐项核验

### 1. inline style 契约冲突 + CSS 变量 fallback —— 通过

- 契约修正已落：`docs/CONTRACTS.md:635-647`（§6.1）按 P4/P5 修正案先例追加“受控 P6 修正”，明确允许 inline style 限布局/间距/尺寸/堆叠、颜色必须走 `--dsh-*`/`--dsw-*` token、每个变量必须带 fallback、几何字面量允许但须过真机视觉门。
- fallback 逐 token 取证：`lib/client.js` 全部 26 个 `var()` token 均带 fallback；首轮指出的 IACVT 风险已消除。
- 残留 nit：width 展开 inset 四次减法而 maxWidth 保留 `4 * var(...)`，与 GoalBar 的既有实现一致，实际一致性待真机视觉门确认。

### 2. 渲染层测试 —— 通过

- 三态：能力缺失/undefined → null；null → 未开始条 + `data-stage-rail`；对象 → 委托 `StageRail`。
- popover：open → `role="dialog"`、`aria-expanded=true`、nextExit 文本、defer 原因；closed → 无 dialog、`aria-expanded=false`、onClick 与 hover setter 接线。
- badge：tone 顺序 `[danger, warning, info]` 断言。
- aria：`role="dialog"` 正反两态 + `aria-expanded` 两态。
- 残留小缺口：badge 反向断言、dock/node aria-label、onMouseLeave 未测。

### 3. `phase.nextExit` —— 通过

- 数据链全通：`buildSnapshot` → `fingerprint` → v1→v2 规范化/未知版本 fail closed → projection schema 校验冻结 → 客户端消费。
- 版本三处 bump 一致：`SNAPSHOT_VERSION/PROJECTION_VERSION = 2`、`stateVersion = 2`、契约表与 p0 测试同步。
- 测试更新到位：v1 迁移专测、nextExit 构建专测、v2 fixture 全面换装。
- nit：`parseState/parseView` 的 v1 分支无直接测试；§2.8 冻结正文的接口与 fingerprint 清单未回写，靠 §6.2 修正覆盖。

### 4. README 与 P6 文档链 —— 主体通过，留一个收尾缺口

- 状态行、P6 已实现清单、P7 未实现、验证命令均同步。
- 缺口：README 曾引用两份尚不存在的 P6 文档；本轮收尾已补 `docs/P6-ACCEPTANCE.md` 与 `docs/P6-ADVERSARIAL-REVIEW.md`。

## 新发现

1.（低）README 曾引用不存在的 P6 文档；已补。
2.（nit）`buildRailModel` 直调 fixture phases 项缺 `name`；已补。
3.（nit）未知额外字段实际是被白名单重建丢弃，不是严格拒绝；与 P1–P5 一致，非 P6 blocker。
4.（nit）inset 计算式与双层扣 inset 需真机视觉门确认；实现沿用 GoalBar 公式。

## 误报

- “存在漏 fallback 的 CSS 变量”——26/26 token 全带，未找到反例。
- “v1→v2 迁移造成快照黑洞或重播种风暴”——fingerprint 含 nextExit，行为正确。
- “evidenced=null 时整段红轨”——已由 `evidencedIndex >= 0` 守卫修复。
- “warning 不可达分支”——已删除。
- “./client 无 types”——已补。
- “MlPhaseDock 早退违反 Hooks 规则”——该组件无 hook，合法。

## 剩余真机风险

1. bundle id（包名 vs 插件名）与宿主 `__ModuleLoader__` 配对。
2. `dsh.client.inject` 清单与 factory require 的出入；需要真实宿主加载链验证。
3. `StateDot`/`Tooltip`/`Tag` props API、`useProjection`/`t` 注入方式、effect/disposer 语义。
4. popover 溢出裁剪、`zIndex: 20` 压层、透明背景主题可读性、密度主题固定 px。
5. `role="dialog"` 无 aria-label、无 Esc 关闭等 a11y 硬化，已声明归 P7。
6. 全量测试与 `dsh --profile web --dump-config` 客户端半验证需在真实插件目录同步后执行。