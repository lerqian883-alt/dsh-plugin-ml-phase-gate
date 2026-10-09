# P2 阶段定义与项目状态验收

> P2 范围：`phases.yml` 加载与校验、默认 + 项目覆盖、项目根解析、`state.json` 读写、项目级写锁。
> 不包含：P3 证据执行、P4 工具面、P5 投影、P6 客户端 UI。

## 1. P2 任务清单

| 编号 | 任务 | 交付物 | 状态 |
|---|---|---|---|
| P2.1 | 实现 YAML 子集解析 | `lib/yaml-subset.js` | 完成 |
| P2.2 | 实现阶段 schema 与合并 | `lib/phases/schema.js`、`phases.default.yml` | 完成 |
| P2.3 | 实现阶段 loader 与检查绑定 | `lib/phases/loader.js` | 完成 |
| P2.4 | 实现项目根解析 | `lib/project-root.js` | 完成 |
| P2.5 | 实现状态 schema | `lib/state/schema.js` | 完成 |
| P2.6 | 实现状态 store 与项目锁 | `lib/state/store.js`、`lib/state/lock.js` | 完成 |
| P2.7 | 完成对抗评审与修复 | `docs/P2-ADVERSARIAL-REVIEW.md` | 完成 |

## 2. 本地验收

命令：

```powershell
node --test --test-isolation=none test/p0-contracts.test.mjs test/p1-skeleton.test.mjs test/p2-yaml.test.mjs test/p2-phases.test.mjs test/p2-project-root.test.mjs test/p2-state.test.mjs
```

结果：

```text
tests 45
pass 45
fail 0
```

覆盖：

- YAML 子集：block mapping、sequence、inline array、注释、JSON-compatible、tabs/block scalar/anchor/tag 拒绝、重复键拒绝。
- 阶段：默认 M0–M8、项目覆盖、新阶段追加、检查前缀唯一绑定、共享检查拒绝。
- 项目根：目录 marker、`work/verify.cmd` marker、嵌套目录、路径包含比较。
- 状态：缺失返回 null、写读回环、坏 JSON fail loud、computed fields 拒绝、evidenceSnapshot 校验。
- 锁：同进程串行、新鲜锁冲突、坏锁冲突、stale 锁回收。
- 原子写：成功路径无 temp 残留，fallback 错误顺序已修正。

## 3. 语法检查

```powershell
node --check lib/contracts.js
node --check lib/errors.js
node --check lib/yaml-subset.js
node --check lib/project-root.js
node --check lib/phases/schema.js
node --check lib/phases/loader.js
node --check lib/state/schema.js
node --check lib/state/store.js
node --check lib/state/lock.js
```

结果：通过。

## 4. P1 安装链回归

P2 未新增依赖，未修改 `main` / `exports` / `dsh.bundle.patch`。`package.json` 仅：

- 更新描述为 P2。
- 将 `phases.default.yml` 加入 `files`。
- 增加 P2 测试脚本。

因此 `link:` 安装链无需重新安装依赖。最终同步到真实插件目录后，已执行：`dsh plugin --profile web add link:<plugin>` 和 `dsh --profile web --dump-config`；组合树仍出现 `# == dsh-plugin-ml-phase-gate`、`- id: ml-phase-gate`、`name: dsh-plugin-ml-phase-gate`。

## 5. 对抗评审

首轮结论：有条件通过。

P2 必修项：

1. stale 锁回收竞态：已修，坏锁/空锁按新鲜冲突处理。
2. `writeStateAtomic` fallback 错误顺序：已修，白名单外先抛错并清 temp。
3. YAML `#` 注释规则：已修，只有行首或前导空白后才是注释。
4. `evidenceSnapshot` 条目校验：已修，拒绝非 plain object 并校验 CheckResult 字段。
5. 共享检查文件测试：已补。

第二轮结论：通过，无 P2 blocker。

额外修复：

- 序列项首键与续行重复键现在 fail closed。
- stale 锁 `unlink` 失败增加一次重试上限，不会无限挂起。

## 6. 后续风险

- `copyFile` fallback 仍是窗口很小的非原子路径；后续可改为二次 rename 或原子写库。
- 坏锁文件不会自动自愈；会 fail loud 并给出 lockPath，需人工删除。
- `state.json` 尚无 fsync；崩溃窗口留到后续硬化。
- P2 状态 store 已支持 `projectStateFile` 选项，但尚未从配置自动传入；P5 接线时完成。
- `phases.default.yml` 默认 checks 为空，P3/P4 必须把空检查视为不可推进。

## 7. P2 退出条件

- 45 项测试通过。
- 语法检查通过。
- 阶段定义加载、项目覆盖、检查绑定、项目根、状态存储、项目锁全部有测试。
- Claude Code 对抗评审完成，P2 blocker 闭合。
- P1 安装链保持。

