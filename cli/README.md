# Iterlay CLI

Iterlay 把图片、视频与创作工作流放在同一张画布上。CLI 让你和 Coding Agent 通过命令生成图片、修改素材、制作视频、整理画板并导出结果，复用 App 已保存的模型服务与授权。

安装 App 后首次打开会自动安装随包 CLI。新开终端后运行 `iterlay help`。

日常使用无需先打开 App：CLI 会连接已有服务，或自动启动隐藏的后台工作台，不弹窗口、不抢焦点，macOS 不显示 Dock 图标。后台复用 App 已保存的模型配置、授权和数据；CLI 退出或停止等待不会终止生成任务。主动打开 App（或调用 `open_iterlay`）会显示同一工作区。由 CLI 启动的工作台关闭窗口后继续在后台运行；通过 App 的退出命令可完全退出。

这仍依赖已安装的 App/Electron 运行时，并非独立的无桌面服务器程序。`--no-launch` 禁止自动启动；服务未运行时会返回连接错误。帮助、版本、工具列表和 Guard 描述可离线读取。

```bash
iterlay providers list --json
iterlay image generate --prompt "极简咖啡杯插画" --out ./cup.png --json
iterlay image edit --input ./cup.png --prompt "改成米白色" --out ./cup-light.png --json
iterlay tasks wait <task-id> --out ./result.png --json
iterlay tools list --json
```

完整工作台操作使用 `iterlay call <operation> --input '<JSON>' --json`，操作与 schema 由 `tools list` 返回。

## 配置视频与旁白模型

配置命令通过 App 主进程原子保存，不会提交生成任务。视频支持现有的 `ark`、`fal`、`openrouter`、`minimax` 协议；`audio` 是新增的独立 OpenAI-compatible TTS 配置，目前仅保存配置，尚未提供语音生成命令、音乐或音效模型。

```bash
# 查看配置，不返回密钥
iterlay providers list --kind video --json
iterlay providers show <provider-id> --json

# 修改已有视频默认模型；保留地址、凭证及其它已保存模型
iterlay models set --kind video --provider <provider-id> --model <model-id> --json

# 新增 TTS：从已有环境变量读取密钥，不把密钥放进命令参数
iterlay providers set --kind audio --provider narration --name "旁白" \
  --base-url https://api.openai.com --model gpt-4o-mini-tts --voice nova \
  --api-key-env OPENAI_API_KEY --default --json

iterlay providers set --kind audio --provider narration --voice alloy --json
iterlay providers default narration --kind audio --json
iterlay providers list --kind audio --json
iterlay models list --provider narration --json
iterlay providers remove narration --kind audio --json
```

新增视频服务使用 `providers set --kind video --type <协议> --base-url <地址> --model <模型>`，可用 `--provider` 自定 ID，省略则生成 ID。重复 `--saved-model <模型>` 会替换已保存列表，并始终包含 `--model` 指定的默认模型；省略则保留列表。`--default` 同时将此服务设为该类别默认服务。内置官方服务不可修改或删除，图片、文本配置暂不开放修改。

TTS 的 `--speech-endpoint` 默认 `/v1/audio/speech`，表示相对 `--base-url` 的接口路径；例如地址为 `https://api.openai.com/v1` 时可设 `/audio/speech`。模型及音色 ID 由服务商决定，保存配置不代表远端模型可用。`models list` 只列已保存模型，不查询远程目录。

凭证可通过 `--api-key-env <变量名>` 或管道配合 `--api-key-stdin` 输入，二者不可同时使用；查询仅返回 `authConfigured`。省略凭证选项会保留原密钥；`--clear-api-key` 显式清除。App 使用系统安全存储加密，无法加密时整次修改回滚。不要把真实密钥放进 `iterlay call --input`、聊天或日志。

fal / OpenRouter 视频可用 `--connection-provider <同类型图片服务ID>` 复用其地址和凭证。复用时不能设置独立密钥；用 `--connection-provider none` 解除关联，再设置独立连接。CLI 与 App 共用设置，需要配套运行包含此功能的新版后台服务；仅替换 CLI 无法让旧 App 支持配置操作。

`iterlay guard descriptor` 可离线输出随包携带的 HOL Guard 命令描述；它不会安装 Guard 或改变 Agent 权限。生成/编辑、文件导出、配置安装与通用调用按影响分类，最终决策仍受 Guard 全局策略控制。参见 [说明](../docs/guard.md)。

Coding Agent 在 App 的设置 → Coding Agent 中一键安装 `iterlay-workspace` 和 `using-iterlay` 两份 Skill，或运行 `npx iterlay add --agent codex` / `--agent claude-code`。`using-iterlay` 仅供手动调用：在 Claude Code 中输入 `/using-iterlay`，在 Codex 中输入 `$using-iterlay`。迁移会移除该 Agent 原来的 Iterlay MCP 条目，保留其他服务。此版本不再提供 MCP server。

指定 `--user-data-path` 或 `ITERLAY_USER_DATA_PATH` 时只连接指定工作区，不自动启动另一个工作区。生成默认等待，`--async` 提交即返回；结束等待不会取消远端任务。导出失败后可重试导出，不必重新生成。

开发：`npm ci && npm run build`。发布前自动同步 App 的 Skill，版本保持一致。
