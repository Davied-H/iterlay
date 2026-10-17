# Iterlay CLI 与 Coding Agent

2026-10-16：本次实现把对外 MCP 服务迁移为 CLI + Skill。App 内部助手继续复用应用操作目录；MasterGo 的外部集成不属于这次移除范围。

## 用户流程

1. 安装并首次打开正式 App，用户级 CLI 启动器自动安装。macOS 的 DMG 拖拽安装没有执行安装后脚本，因此安装时点是 App 首次运行。
2. 配置一次图片/视频服务，CLI 通过本地 App 服务使用现有授权，凭据不会复制到 CLI 或 Skill。
3. 设置 → Coding Agent：自动检测 Codex / Claude Code，每个 Agent 一键安装 Skill；安装操作同时确保 CLI 就绪。
4. 新开 Agent 会话，使用页面提供的试用提示词。Skill 指导 Agent 从 shell 调用 CLI。
5. 缺少 CLI、图片服务或 Agent Skill 时，工作台显示可关闭的气泡并直达相应设置；同一原因关闭后不反复提示。

## 已实现命令

```bash
iterlay status --json
iterlay providers list --kind image --json
iterlay models list --provider <id> --json
iterlay image generate --prompt "极简咖啡杯插画" --out ./cup.png --json
iterlay image generate --reference ./product.jpg --prompt "改为摄影棚布光" --out ./product.png --json
iterlay image edit --input ./cup.png --prompt "杯身改为米白色" --out ./cup-light.png --json
iterlay video generate --prompt "林间的缓慢运镜" --async --json
iterlay tasks get <id> --json
iterlay tasks wait <id> --out ./result.png --json
iterlay tasks wait <video-id> --kind video --json
iterlay boards list
iterlay boards create --name "产品图"
iterlay assets import --input ./product.jpg --board <id> --json
iterlay assets export --path <managed-path> --out ./product.png --json
iterlay tools list --json
iterlay call arrange_images --input '{"boardId":"<id>","nodeIds":["<a>","<b>"],"mode":"grid"}' --json
iterlay add --agent codex
iterlay remove --agent claude-code
```

全部原工作台操作均保留在 `tools list` 目录中，通过 `call` 访问，包括画板读取、打开、聚焦、编排、版本切换、回收站、图片生成/编辑、视频生成/续写/重混、媒体导入与原有 ZIP 导出。

常用命令增加文件路径输入/输出、默认 Provider、默认 CLI 创作画板、同步等待与异步提交。`providers list` 返回受限配置投影，`models list` 返回已保存的模型，不将远端目录或远端健康状态冒充本地已验证事实。

## 设置页

采用三步向导：准备环境（CLI 与模型服务）→ 安装 Skill（按 Agent 分行操作）→ 开始使用（复制提示词或终端命令）。顶部可直接切换步骤，底部支持上一步/下一步，默认定位到未完成步骤；安装 Skill 成功后进入使用步骤。内容铺满右侧面板，两侧保留 24px 内边距，维护详情保持折叠。

- 主要按钮依据实际状态显示安装、迁移或复制示例。
- 旧版 MCP / 插件包配置入口已移除；无需用户处理服务命令、参数或 Token。
- 检测可执行文件与 Codex 桌面 App，残留配置仅标为 config-only；Iterlay 自己创建的 Skill 目录不能被视为已安装程序。
- 配置状态不声称 Agent 会话已连接。Skill 安装后提示新开会话加载。
- 失败显示具体错误，保留重试。CLI 同名路径冲突时不覆盖既有文件。
- 未安装 Agent 也可预装 Skill；缺少模型时直接跳转现有模型设置。
- 安装、重新检测、复制与维护支持键盘，文案进入现有中英文翻译体系。

## 分发与隔离

`cli/` 的构建随 App 打包到 Resources/cli；启动器通过随 App 携带的 Electron Node 运行时执行，不依赖系统 Node/npm。macOS/Linux 使用 `~/.local/bin/iterlay`；Windows 使用同目录的 `iterlay.cmd`。支持用户 PATH 配置与启动器版本自检。临时 DMG 或 App Translocation 路径提示先移动 App。

网页开发使用隔离的 `userData/agent-home/` 作为安装目标；不会自动写入真实 CLI、shell 配置或 Agent 目录。测试启动器绑定开发 userData，避免误连正式工作区。

默认网页端口为 5180；`ITERLAY_BROWSER_DEV_PORT` 可用于并行的隔离验收工作区。

## 旧版迁移

为目标 Agent 安装新 Skill 时，清理其原有 Iterlay MCP 条目，只处理 `[mcp_servers.iterlay]` 及 env，或 `mcpServers.iterlay`；保留其他服务、模型与用户配置。无效 JSON 报错并保留原文件。

Skill 通过临时目录替换托管副本，保留升级文件差异通知和现有拒绝自动安装策略。自行维护的同名 Skill 不被覆盖或删除；旧版官方 Skill 可按识别到的内容迁移。

删除了 stdio MCP server、`--mcp` 特殊启动模式、插件包生成和相关公开 IPC。保留本地鉴权的应用服务，它是 CLI 与内部助手的执行通道，不再提供 MCP 协议。

## 任务与文件

- 图片请求可携带稳定 requestId（CLI 为 `--request-id`），作为任务 ID 持久化。相同请求与相同参数复用任务；参数不同则冲突；并发提交去重。
- 只在启动阶段重试只读 readiness 探测，业务操作不自动重发。图片提交失败显示请求 ID，供查询不确定任务。
- CLI 默认等待，`--async` 返回任务身份。Ctrl+C / 等待超时只停止等待。
- 生成后导出失败保留任务，可再次 `tasks wait --out`。已有文件默认不覆盖，显式 `--overwrite` 才覆盖。
- 本地参考图先受控导入；底层操作继续校验受管路径。
- JSON 结果与进度分流 stdout/stderr；JSON 不附带预览图 base64。
- App 重启后可读取已完成图片任务；进行中图片任务报告中断和远端不确定性，不自动重新计费。视频沿用 App 的持久化恢复能力；停止轮询不代表远端取消。

## 验证与限制

验证覆盖类型检查、lint、工作台与 CLI 单元测试、真实 CLI 子进程、网页设置/安装操作、标准与窄窗口布局，以及离线 Provider 的网页和 CLI 生成闭环。未使用个人 Provider 或真实付费请求。

本机真实运行验证为 macOS。Windows 路径分发与 PATH 注册实现需要在 Windows 上做安装验收。无窗口后台服务、批量工作流、远端模型目录刷新和更细的结构化退出码不在本次交付范围。

## 调研依据

- [Skills 安装详情](https://www.skills.sh/vercel-labs/skills/find-skills)：公开网页中的单一步骤安装和复制入口，作为界面层级参考。
- [Skills CLI 文档](https://www.skills.sh/docs/cli)：安装与 CLI 使用流程。
- [CC Switch Skills 官方文档](https://github.com/farion1231/cc-switch/blob/main/docs/user-manual/en/3-extensions/3.3-skills.md)：按目标 Agent 安装、独立启用状态、冲突与更新处理。文档是流程证据，未将其当成实测桌面 App 界面。

用户已确认采用“CLI 状态＋按 Agent 一键安装＋试用提示词”的方向并直接实施。

CLI 默认画板可在「设置 → Coding Agent → CLI 创作」中配置。`--board` 优先于该设置；未配置时复用或创建「CLI 创作」。默认画板已删除时，提交前报错并引导重新选择，避免生成结果进入意外画板。目标画板由 App 统一解析，图片、视频和 `call generate_image` 共用该规则。
