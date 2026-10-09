# P1 对抗式评审记录

> 评审工具：Claude Code CLI 2.1.289。
> 评审模式：只读、对抗式、尝试证伪。
> 完整原始输出：`docs/P1-ADVERSARIAL-REVIEW.raw.md`。
> 评审边界：只检查 P1 骨架与安装链，不进入 P2/P3/P5/P6。

## 1. 评审目标

- `package.json` 是否能被 DSH 安装为 bundle。
- `cordis.patch.yml` 是否正确插入。
- `lib/index.js` 是否能被 Cordis loader 使用。
- `ctx.effect` 缺失降级是否安全。
- `inject = []` 是否符合 P1 边界。
- `normalizeConfig` 是否存在路径逃逸或类型漏洞。
- P1 测试是否覆盖关键不变量。
- 安装链是否有 profile 破坏风险。
- P1 是否越界或遗漏必要骨架。
- P1 是否与 P0 契约漂移。

## 2. 首轮结论

**有条件通过**。

骨架、导出形状、patch 形状与在跑先例一致，未越 P1 边界；但存在两个 P1 必修项。

## 3. 评审发现与处置

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P1-R01 | 高 | `requireSafeRelativePath` 放过 `C:tmp\x`、`C:`、`C:x` 这类 Windows 盘符相对路径 | 已改为任何 `^[A-Za-z]:` 前缀一律拒绝，并补三条测试 |
| P1-R02 | 中 | P1 没有任何测试断言“不注册工具/投影/注入/客户端资源” | 已新增 spy 负向测试，断言 apply 只调用一次 effect |
| P1-R03 | 中 | `ctx.effect` 缺失时 disposer 被丢弃且静默降级 | 已改为返回 disposer，并标明 test-only；P2 挂真实资源前必须硬化或移除 |
| P1-R04 | 低 | `config: {}` 未获先例直接背书 | 保留，列为真实 `--dump-config` 验证点 |
| P1-R05 | 低 | `phases.default.yml` 不存在且不在 `files` | 属 P2 交付范围，P2 同步补 `files` 与存在性测试 |
| P1-R06 | 低 | default export 被 `Object.freeze` 的 loader 兼容性 | 保留，真实安装/组合时验证无 TypeError |
| P1-R07 | 低 | `private: true` 阻塞未来 npm 分发，缺 `engines` | 属分发阶段风险；link 安装不受影响 |
| P1-R08 | 低 | 评审副本路径与安装路径不同源 | P1.6 安装后以加载日志版本行确认运行版本 |

## 4. 误报与已证伪项

- `__proto__` / `constructor` 原型污染：已证伪，未知键全部拒绝且输出按白名单重建。
- 不可枚举属性绕过：已证伪，输出重建只取白名单字段。
- `inject = []` 导致永不加载：已证伪，空注入是无条件满足。
- `exports` / `types` 解析缺陷：已证伪，主入口和子路径指向正确。
- `private: true` 阻塞 `link:` 安装：已证伪，只影响 npm publish。
- P0 ↔ P1 契约漂移：已证伪，包名、插件名、默认配置和测试计数一致。
- UNC / POSIX 绝对路径 / NUL 逃逸：已证伪，已被拒绝；唯一漏洞是盘符相对路径，已修。

## 5. P1 关闭记录

状态：**P1 已关闭**。

已取得证据：

1. 真实 `dsh plugin --profile web add link:<path>` 成功。
2. `dsh --profile web --dump-config` 出现 `# == dsh-plugin-ml-phase-gate`、`- id: ml-phase-gate`、`name: dsh-plugin-ml-phase-gate`。
3. 卸载后 `ml-phase-gate` 从 `dump-config` 消失，profile 仍可组合。
4. 再安装后插件条目恢复。
5. `docs/P1-ACCEPTANCE.md` 已回填真实安装、卸载、再安装输出。
6. 本地 P0 + P1 测试：20/20 通过。

边界：未启动常驻 web 服务，因此真实 apply 运行日志留到后续集成阶段；P1 blocker 已由单元测试和组合链闭合。

