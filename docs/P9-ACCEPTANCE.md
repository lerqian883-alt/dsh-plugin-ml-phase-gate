# P9 发布与可插拔性验收

> 目标：让插件从 GitHub 获取后可安装、可初始化、可跨平台验证，并产出可校验的 release tarball。

## 1. 交付

- `package.json` 发布元数据与文件白名单。
- `scripts/bootstrap-project.mjs`。
- `scripts/check-package.mjs`，审计实际 `npm pack --dry-run --json` 文件清单。
- `scripts/smoke-install.mjs` 源码级 bootstrap/verify smoke。
- `scripts/smoke-package.mjs` 从 release tarball 安装并 import。
- `scripts/pack-release.mjs` 生成 tarball 和 SHA256。
- Windows 与 Node 示例项目。
- GitHub Actions Windows/Linux 矩阵。
- `LICENSE`、`CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`、`.gitignore`。
- README 对外安装、bootstrap、启动和发布说明。

## 2. 测试结果

本地发布仓库：

```text
tests 148
pass 147
fail 0
skipped 1
```

跳过项为：

```text
standard posix scaffold uses LF and fails placeholders
```

当前 Windows 环境没有可用的 `sh`。CI 的 Ubuntu job 会覆盖该路径。Windows 标准 scaffold 已实际执行：

```text
known prefix -> fail
unknown prefix -> fail
```

不会再把占位检查误报为 pass。

## 3. 打包结果

```text
filename: dsh-plugin-ml-phase-gate-0.1.2.tgz
files: 69
sha256: EE6C68A23C4A5E95FBAB13DFE4EB02085C06D4FCC101E8FC3BC23DBB3B73A561
```

验证：

- `npm run pack:check` 审计实际 pack 清单，通过。
- `npm run release:pack` 生成 tarball 和 `.sha256`。
- `npm run smoke:package` 从 tarball 安装到临时目录。
- 安装后存在 `scripts/`、`examples/`、`docs/P9-IMPLEMENTATION-LOGIC.md`。
- `import('dsh-plugin-ml-phase-gate')` 返回 `name=ml-phase-gate` 和 `apply`。

## 4. 跨平台 verify

自动发现：

```text
work/verify.cmd
work/verify.ps1
work/verify.mjs
work/verify.sh
```

已验证：

- Node `verify.mjs` 自动发现和通过。
- Windows `verify.cmd` CRLF 和退出码。
- Windows `verify.ps1`。
- POSIX `verify.sh` 文本使用 LF；实际执行留给 Ubuntu CI。

## 5. 安全与发布边界

- 发布包审计拒绝作者绝对路径、用户名、私钥和常见 token 形状。
- 默认不自动运行项目检查脚本。
- `work/verify.*` 和 `work/checks/*` 仍是用户项目代码。
- 远端创建、push、npm publish、GitHub Release 不自动执行，需要用户明确授权。
