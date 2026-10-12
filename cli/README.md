# iterlay

Iterlay coding agent 集成 CLI：一条命令为 Codex / Claude Code 安装 Iterlay Skill 并配置 Iterlay MCP 服务。

```bash
npx iterlay add
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `iterlay add` | 安装 Skill 并写入 MCP 配置（自动检测已安装的 agent） |
| `iterlay remove` | 移除 Iterlay Skill 与 MCP 配置 |
| `iterlay help` | 显示帮助 |

## 选项

| 选项 | 说明 |
| --- | --- |
| `--agent <codex\|claude-code>` | 指定目标 agent，可重复；缺省自动检测 |
| `--skill-only` | 只安装 Skill，不写 MCP 配置 |
| `--app-path <path>` | 手动指定 Iterlay App 安装路径 |
| `--user-data-path <path>` | 手动指定 Iterlay 用户数据目录 |
| `--json` | 输出 JSON 结果 |

## 说明

- Skill 安装位置与 Iterlay App 一致：`~/.codex/skills/iterlay-workspace` 与 `~/.claude/skills/iterlay-workspace`，升级由 Iterlay App 启动时自动维护。
- `iterlay remove` 之后，Iterlay App 不会再自动安装 Skill，直到重新运行 `iterlay add` 或在 App 内重新连接。
- MCP 配置只写入 Iterlay 自己的条目（`[mcp_servers.iterlay]` / `mcpServers.iterlay`），不影响其他 MCP 服务。

## 开发（iterlay-app 仓库内）

```bash
cd cli
npm ci                 # 首次发布或依赖变更后安装锁定依赖
npm run build          # tsc 编译到 cli/dist
npm publish            # prepublishOnly 会先从 ../resources/skills 同步 Skill 并重新构建
```

版本号与 Iterlay App 保持一致，发布顺序：先发 App，再发本包。
