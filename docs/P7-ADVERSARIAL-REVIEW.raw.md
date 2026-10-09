# P7.1 对抗式评审（只读原始记录）

## 结论

**有条件通过（代码级可交付，但 5 项必修未闭合前不应退出 P7.1）**。两阶段注册与 `MlPhaseAudit` 投影消费本身没有发现可证伪的缺陷；测试没有假测试；P6 未被破坏。但存在入口可见性、未挂载守卫、类型/契约/README 同步缺口。

## 必修项

1. **M1（高）**：文档称“sidebarRight 缺席时 Dock 不显示入口”，实现却无条件注入 `openAudit`，导致按钮可见但静默无效。
2. **M2（高）**：`openAuditTab` 只判断 `mounted === undefined`，若 `getSnapshot()` 返回 `null`，可能继续调用 fail-loud 的 `openTab`；降级路径无测试。
3. **M3（中）**：`lib/client.d.ts` 的 `inject` 仍是 `['slots','locale']`，实际为四元能力；apply ctx 类型缺 sidebarRight/sidebarRightTabs。
4. **M4（中）**：`docs/CONTRACTS.md` 没有 P7 修正节；新增 `sidebar.right.pane.tab`、tab registry 和 dock `inject` 未入契约。
5. **M5（中）**：README 索引引用不存在的 `docs/P7-ADVERSARIAL-REVIEW.md`。

## 新发现

- dock 注册中的 `inject` 选项仍属宿主 API 假设，必须真机验证。
- `exports.inject` 对 sidebarRight/sidebarRightTabs 的硬依赖与“安全降级”在加载层面存在张力。
- `audit.defer` / `node.defer` 是死 i18n 键。
- `package.json` description 仍停留在 P6。
- `translate` 在 locale.bind 缺席时回退显示原始 key。
- P7.2/P7.3 边界仍然完整保留。

## 已证伪/误报

- 未发现 id/kind/slot 冲突。
- `MlPhaseAudit` 没有磁盘、检查或写路径。
- 三态、summary、rows、nextExit、defer 渲染正确。
- 测试是行为性测试，不是假测试。
- 未发现 P6 回归。

## 测试结论

静态核对 P0–P6 107 项与 P7.1 4 项相加为 111；本轮评审未执行测试。评审后实现方补了 2 个降级测试，最终本地回归为 113/113。