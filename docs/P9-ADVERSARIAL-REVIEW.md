# P9 对抗式评审汇总

## 1. 首轮结论

首轮只读评审发现 1 个 Blocker、2 个 High、4 个 Medium/Low。

| 编号 | 严重度 | 发现 | 处置 |
|---|---|---|---|
| P9-R01 | Blocker | bootstrap 的 cmd/sh 模板使用 CR-only，可能假通过 | 改为 CRLF/LF；增加 Windows 标准 scaffold 回归；POSIX 留给 Ubuntu CI |
| P9-R02 | High | 包检查扫描源码仓库，不扫描实际 npm pack 清单 | 改为解析 `npm pack --dry-run --json` 并校验发布 allowlist |
| P9-R03 | High | tarball smoke 硬编码 `0.1.0` | 从 `package.json.version` 动态推导 |
| P9-R04 | Medium | Windows npm fallback 可能 EINVAL | 使用 `npm_execpath` 优先，Windows fallback 走 `cmd.exe` |
| P9-R05 | Medium | secret 扫描太窄 | 增加 GitHub token、OpenAI key、AWS key、PEM 私钥模式 |
| P9-R06 | Medium | 文档写 `minimal`，代码使用 `standard` | 文档统一为 `standard|node` |
| P9-R07 | Medium | `--force` 文档与行为不一致 | 明确会覆盖管理路径冲突文件 |
| P9-R08 | Medium | tarball smoke 只验证 import | 增加 scripts/examples/docs 文件存在断言 |

## 2. 复测

修复后：

- `npm test`：147 pass，0 fail，1 skip。
- Windows 标准 scaffold：通过。
- `npm run pack:check`：通过。
- `npm run release:pack`：通过。
- `npm run smoke:package`：通过。
- tarball SHA256 已生成。

## 3. 保留边界

- 当前 Windows 环境没有 `sh`，POSIX shell 执行留给 Ubuntu GitHub Actions。
- GitHub Actions 尚未在远端实际运行；本地已执行相同命令序列。
- GitHub 远端创建、push、Release 和 npm publish 仍需用户凭据与明确授权。
