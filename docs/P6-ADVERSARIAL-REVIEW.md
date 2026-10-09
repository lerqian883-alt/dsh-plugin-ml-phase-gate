# P6 对抗式评审记录

> 评审工具：Claude Code CLI 2.1.289。
> 评审模式：只读、对抗式、尝试证伪。
> 原始输出：`docs/P6-ADVERSARIAL-REVIEW.raw.md`、`docs/P6-ADVERSARIAL-REVIEW.round2.raw.md`。
> 评审边界：只检查 P6，不进入 P7。

## 1. 首轮结论

**有条件通过**。双游标模型、三态渲染、槽位注册和契约边界正确，但有四个 P6 必修项。

## 2. P6 必修项与处置

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P6-R01 | 高 | inline style 与 CSS Modules 契约字面冲突；CSS 变量缺 fallback 会触发 IACVT | 补 `CONTRACTS.md` §6 P6 修正节；26/26 token 加 fallback；记录受控偏离 |
| P6-R02 | 高 | 渲染层零测试，三态、popover、badge、aria 未执行 | `test/p6-client.test.mjs` 增加三态、badge、open/closed popover、aria 和 setter 接线测试；P6 测试 11/11 通过 |
| P6-R03 | 中 | `phase.nextExit` 是死代码，快照/投影没有该字段 | 正式扩展 `buildSnapshot` 与 projection schema；bump `SNAPSHOT_VERSION/PROJECTION_VERSION/stateVersion` 到 2；增加 v1→v2 迁移测试 |
| P6-R04 | 中 | README 仍写 P6 未实现，验证命令和文档链缺失 | README 状态、P6 清单、P7 边界、验证命令和文档索引同步；补 P6 实现逻辑、验收和评审文档 |

## 3. 额外修复

- 删除不可达的 `warning` 分支，保留 primitives 支持的 done/ongoing/error/idle 映射。
- `MlPhaseDock` 对缺失 `useProjection` 能力返回 null，避免宿主版本漂移时直接抛异常。
- `package.json` 为 `./client` 增加 `types` 条件和 `lib/client.d.ts`。
- `buildRailModel` 测试 fixture 补全 `name`，与 projection schema 一致。
- 快照 decode 保留 v1 兼容，规范化为 v2 并设置 `nextExit = null`。

## 4. 第二轮结论

**第二轮静态复核：有条件通过。** 四个必修项中 1、2、3 已闭合；第 4 项只缺 P6 验收/评审文档，本轮已补齐。未发现新的代码级 P6 blocker。

第二轮评审因权限模式无法执行 `node --test`，测试证据以本地实际执行为准：

```text
P6: 11 tests, 11 pass, 0 fail
P0–P6 全量: 107 tests, 107 pass, 0 fail
```

## 5. 仍保留的后续风险

- 真实 DSH 宿主上的 `__ModuleLoader__` bundle id、客户端半配对和加载顺序已由真实 web UI 视觉门通过验证。
- `StateDot` / `Tooltip` / `Tag` props API、`useProjection` / `t` 注入形状已由真实 UI 渲染与 popover 打开验证。
- popover 在 1440×900 视口未被 composer 裁剪；窄屏、暗色主题和密度主题仍需 P7 走查。
- `role="dialog"` 无 aria-label、无 Esc 关闭等 a11y 硬化留给 P7。
- `parseState/parseView` 的 v1 分支需要补直接测试，避免只依赖 codec 迁移测试。
## 6. 收尾补验

第二轮评审提出的唯一收尾缺口（P6 验收/评审文档缺席）已补齐。随后在真实插件目录完成：

- P0–P6 全量回归：107/107 通过。
- `dsh plugin --profile web add link:<real-plugin>` 成功。
- `dsh --profile web --dump-config` 组合树包含 `id: ml-phase-gate` / `name: dsh-plugin-ml-phase-gate`。
- `dsh --profile web --no-open --port 0` 成功启动 web 服务，未出现 `client bundle not found` 或 client-modules 解析错误；启动冒烟后停止。

真实浏览器视觉门已通过：M0/M1 完成、M2 证据缺口、M3–M8 未开始，gap/defer/next badge 与 popover 的 checks/artifacts/pitfalls/defer 内容均可见，console 无相关错误。\n\n证据截图：C:\\ml-workspace\\ml-phase-visual-fixture\\p6-visual-gate-desktop.png、C:\\ml-workspace\\ml-phase-visual-fixture\\p6-visual-gate-rail.png。
