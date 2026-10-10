# P1 插件骨架与安装链验收

> P1 范围：loadable host-half skeleton + profile 安装链。
> 不包含：P2 阶段解析、P3 证据、P5 投影、P6 客户端 UI。

## 1. P1 任务清单

| 编号 | 任务 | 交付物 | 状态 |
|---|---|---|---|
| P1.1 | 扩展包身份与 DSH bundle 声明 | `package.json`、`cordis.patch.yml` | 完成 |
| P1.2 | 实现 host-half 生命周期骨架 | `lib/index.js`、`lib/index.d.ts` | 完成 |
| P1.3 | 实现零依赖配置规范化 | `lib/config.js` | 完成 |
| P1.4 | 建立 P1 测试 | `test/p1-skeleton.test.mjs` | 完成 |
| P1.5 | 编写 P1 实现逻辑与安装文档 | `docs/P1-IMPLEMENTATION-LOGIC.md`、`README.md` | 完成 |
| P1.6 | 真实 profile 安装、卸载、再安装验证 | profile 记录 | 完成 |
| P1.7 | Claude Code 对抗评审 | `docs/P1-ADVERSARIAL-REVIEW.md` | 完成 |

## 2. 本地验收

### 2.1 P0 + P1 测试

命令：

```powershell
node --test test/p0-contracts.test.mjs test/p1-skeleton.test.mjs
```

实际结果：

```text
tests 20
pass 20
fail 0
```

### 2.2 语法检查

命令：

```powershell
node --check lib/contracts.js
node --check lib/config.js
node --check lib/index.js
node --check test/p0-contracts.test.mjs
node --check test/p1-skeleton.test.mjs
```

实际结果：

```text
通过，无语法错误
```

## 3. 安装链验收

### 3.1 安装

命令：

```powershell
dsh plugin --profile web add link:"<dsh-workspace>\.dsh\plugins\ml-phase-gate"
```

实际结果：

```text
pnpm 安装成功。
profile dependencies 新增：
dsh-plugin-ml-phase-gate: link:<dsh-workspace>/.dsh/plugins/ml-phase-gate

profile bundles 新增：
dsh-plugin-ml-phase-gate
```

### 3.2 组合验证

命令：

```powershell
dsh --profile web --dump-config
```

实际结果：

```text
# == dsh-plugin-ml-phase-gate
- id: ml-phase-gate
  name: dsh-plugin-ml-phase-gate
```

### 3.3 卸载

命令：

```powershell
dsh plugin --profile web remove dsh-plugin-ml-phase-gate
```

实际结果：

```text
pnpm 卸载成功。
profile dependencies 不再包含本包。
profile bundles 不再包含本包。
```

### 3.4 卸载后组合

命令：

```powershell
dsh --profile web --dump-config
```

实际结果：

```text
dump-config 中不再出现 ml-phase-gate。
profile 仍可正常组合。
```

### 3.5 再安装

命令：

```powershell
dsh plugin --profile web add link:"<dsh-workspace>\.dsh\plugins\ml-phase-gate"
```

实际结果：

```text
pnpm 再安装成功。
dump-config 再次出现：
# == dsh-plugin-ml-phase-gate
- id: ml-phase-gate
  name: dsh-plugin-ml-phase-gate
```

## 4. Claude Code 对抗评审

评审范围：

- `package.json` 是否足以被 DSH 安装为 bundle。
- `cordis.patch.yml` 是否正确插入。
- `lib/index.js` 是否能在真实 Cordis context 上 apply。
- `ctx.effect` 降级是否安全。
- `normalizeConfig` 是否有路径逃逸、类型或冻结漏洞。
- P1 是否越界进入 P2/P3/P5/P6。
- 安装链是否可能破坏 profile。

首轮结论：

```text
有条件通过。
```

已闭合必修项：

- P1-R01：Windows 盘符相对路径绕过已修，`C:tmp\x`、`C:`、`C:x` 均有测试。
- P1-R02：新增“P1 不注册任何业务资源”的 spy 负向测试。

已记录后续风险：

- P1-R03：`ctx.effect` 缺失的 test-only fallback 在 P2 挂真实资源前必须硬化或移除。
- P1-R04：`config: {}` 已由真实 `--dump-config` 验证可组合。
- P1-R06：default export 冻结未在真实常驻 boot 中验证；不阻塞安装链。

## 5. 边界

- 未启动常驻 web 服务，因此没有采集真实 apply 运行日志。
- `dsh --profile web --help` 只打印 web app help，不执行插件 apply。
- loader 兼容性和生命周期行为由 P1 单元测试覆盖。
- 真正的 apply 运行验证应在后续带有可观测启动日志的集成阶段完成。
- `link:` 安装要求插件源目录保持原位。

## 6. P1 退出条件

- 20 项本地测试通过。
- 语法检查通过。
- 真实 profile 安装成功。
- `--dump-config` 出现插件条目。
- 卸载后条目消失且 profile 仍可组合。
- 最终重新安装。
- Claude Code 对抗评审完成，P1 blocker 已闭合。
