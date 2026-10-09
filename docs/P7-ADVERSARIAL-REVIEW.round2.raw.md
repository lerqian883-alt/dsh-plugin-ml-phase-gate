# P7.2.1 对抗式评审（只读原始记录）

## 结论

watcher 不自动运行 verify.cmd 的设计成立，status deferred snapshot 成立，v3 stale wire 大体自洽；但发现 5 个必修项：suppression 只延迟不丢弃、session 结束不释放 watcher、v2→v3 丢掉 nextExit、关键测试缺口、watch.js 死常量与 contracts typedef 漂移。

## 必修项

1. suppression 在窗口内到达的事件最终仍会标记 stale，导致 advance/defer 自写入后约 1 秒出现假 stale。
2. `session/disposed` 未清理 watcher，长驻插件会泄漏 OS watcher。
3. v2 snapshot 的 `nextExit` 被迁移为 null，违反 P6 契约。
4. suppression 测试在到期前结束；缺少幂等、session disposed、debounce 合并和 v2 nextExit 测试。
5. watch.js 残留 SUPPRESSED_UNTIL / DEFAULT_SUPPRESS_MS 死常量；contracts JSDoc typedef 缺 stale/staleAt。

## 误报/非问题

- watcher 不 import evidence/child_process。
- fingerprint 忽略 staleAt、包含 stale。
- 投影已 stale 时仍先失效缓存无害。
- null projection 不追加消息正确。
- 旧 P4 测试没有 deferContext 也能安全降级。

## 剩余边界

- 多 session 同项目去重。
- artifact watcher。
- opt-in 自动检查。
- status 连续调用没有 fingerprint 去重。
- 宿主 fs.watch 事件语义和 session 引用稳定性仍需真机证据。