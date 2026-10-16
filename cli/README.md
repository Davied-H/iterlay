# Iterlay CLI

使用 Iterlay App 已保存的服务和授权生成图片、编辑素材、生成视频与管理画板。

安装 App 后首次打开会自动安装随包 CLI。新开终端后运行 `iterlay help`。

```bash
iterlay providers list --json
iterlay image generate --prompt "极简咖啡杯插画" --out ./cup.png --json
iterlay image edit --input ./cup.png --prompt "改成米白色" --out ./cup-light.png --json
iterlay tasks wait <task-id> --out ./result.png --json
iterlay tools list --json
```

完整工作台操作使用 `iterlay call <operation> --input '<JSON>' --json`，操作与 schema 由 `tools list` 返回。

Coding Agent 在 App 的设置 → Coding Agent 中一键安装 `iterlay-workspace` 和 `using-iterlay` 两份 Skill，或运行 `npx iterlay add --agent codex` / `--agent claude-code`。`using-iterlay` 仅供手动调用：在 Claude Code 中输入 `/using-iterlay`，在 Codex 中输入 `$using-iterlay`。迁移会移除该 Agent 原来的 Iterlay MCP 条目，保留其他服务。此版本不再提供 MCP server。

指定 `--user-data-path` 或 `ITERLAY_USER_DATA_PATH` 时只连接指定工作区，不自动启动另一个工作区。生成默认等待，`--async` 提交即返回；结束等待不会取消远端任务。导出失败后可重试导出，不必重新生成。

开发：`npm ci && npm run build`。发布前自动同步 App 的 Skill，版本保持一致。
