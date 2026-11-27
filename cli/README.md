# Iterlay CLI

Iterlay 把图片、视频与创作工作流放在同一张画布上。CLI 让你和 Coding Agent 通过命令生成图片、修改素材、制作视频、整理画板并导出结果，复用 App 已保存的模型服务与授权。

安装 App 后首次打开会自动安装随包 CLI。新开终端后运行 `iterlay help`。

日常使用无需先打开 App：CLI 会连接已有服务，或自动启动隐藏的后台工作台，不弹窗口、不抢焦点，macOS 不显示 Dock 图标。后台复用 App 已保存的模型配置、授权和数据；CLI 退出或停止等待不会终止生成任务。主动打开 App（或调用 `open_iterlay`）会显示同一工作区。由 CLI 启动的工作台关闭窗口后继续在后台运行；通过 App 的退出命令可完全退出。

## 独立使用与 Linux 服务器

CLI 现在包含纯 Node.js 后台，不安装 App / Electron 也能生成和编辑图片、生成视频、管理画板与模板、导入、切图和导出素材。需要 Node.js 22.12 或更新版本。源码中的这项能力尚未发布到 npm；使用包含本改动的本地安装包，不要把现有 npm 版本当作已升级。

```bash
# 在主仓库构建，再制作 npm 安装包
npm ci --prefix cli
npm run build --prefix cli
cd cli
npm pack
npm install -g ./iterlay-0.1.70.tgz

# 显式选择独立工作区；无 App 的机器默认使用此模式
iterlay status --standalone --json
iterlay providers set --standalone --kind image --provider images \
  --base-url https://api.openai.com --model gpt-image-1 \
  --api-key-env OPENAI_API_KEY --default --json
iterlay image generate --standalone --prompt "极简咖啡杯插画" --out ./cup.png --json
iterlay boards list --standalone --json
iterlay server stop --standalone --json
```

有 App 时保留原来的连接与后台启动行为；`--standalone` 强制使用独立 Node 后台。没有 App 时自动选择独立模式。独立默认目录：macOS 为 `~/Library/Application Support/Iterlay CLI`，Linux 为 `${XDG_DATA_HOME:-~/.local/share}/iterlay`，Windows 为 `%LOCALAPPDATA%/Iterlay CLI`。使用 `--user-data-path <目录>` 或 `ITERLAY_USER_DATA_PATH` 指定服务端工作区，每条命令使用同一目录。独立模式不能复用 App 数据目录；两边配置和授权分别保存。

独立 CLI 按需自动启动常驻 Node 后台，因此 `--async`、Ctrl+C 或 CLI 退出不终止生成。`--no-launch` 禁止自动启动；未运行时返回连接错误。App 模式指定工作区时仍只连接已有服务。帮助、版本、工具列表和 Guard 描述可离线读取。

无桌面服务器使用前台服务，交给 systemd、Docker 或其他进程管理器托管：

```bash
iterlay serve --user-data-path /var/lib/iterlay
# 另一个终端；也可设置 ITERLAY_USER_DATA_PATH，省略重复路径
iterlay status --standalone --user-data-path /var/lib/iterlay --no-launch --json
```

服务只监听 `127.0.0.1` 的自动端口，通过工作区内的私有发现文件鉴权，不需要 DISPLAY、窗口系统、Xvfb 或 Electron。它用于在服务器本机或通过 SSH 执行 CLI，没有对外开放 HTTP API。一个工作区只允许一个 Node 后台写入；异常退出后的锁最多约 10 秒过期。`SIGTERM` / `SIGINT` 停止接收请求、等待已接收的图片任务落盘并暂停视频轮询；下次启动按原远端任务 ID 恢复视频，无法确认的图片状态不会自动重新提交。

独立凭据通过 AES-256-GCM 保存，主密钥为工作区内权限 `0600` 的 `credential-key`；它是本地文件密钥，不等同于桌面系统钥匙串。备份时保护并同时保留该文件与工作区。缺失或损坏不会静默生成新密钥替换已有凭据。查询不返回密钥。独立模式支持自有 API Key 服务，桌面 Codex OAuth 登录不会自动迁入。

`boards open`、`open_iterlay`、聚焦等窗口操作在独立模式明确报错。导出使用 `--out` 或 `assets export`；需要桌面保存对话框的 `export_assets` 不支持。切图使用 npm 包依赖的 Sharp；视频生成、下载和原样导出不要求 FFmpeg。音频仍只有 TTS 配置，没有语音生成命令。

本地验证：`pnpm build:cli && pnpm test:cli:standalone`。验收使用隔离目录和本地模拟 Provider，不访问个人密钥或付费模型。服务托管示例和无桌面容器验证方法见 [独立运行指南](docs/cli-standalone.md)。

```bash
iterlay providers list --json
iterlay image generate --prompt "极简咖啡杯插画" --out ./cup.png --json
iterlay image edit --input ./cup.png --prompt "改成米白色" --out ./cup-light.png --json
iterlay tasks wait <task-id> --out ./result.png --json
iterlay tools list --json
```

完整工作台操作使用 `iterlay call <operation> --input '<JSON>' --json`，操作与 schema 由 `tools list` 返回。

`--reference`、`image edit --input` 和 `assets import --input` 按原始文件字节数校验：每个非空素材最多 20 MiB（20,971,520 字节）。Base64 编码后的数据使用独立的媒体校验，不占用提示词的 100,000 字符额度；CLI 会先导入原始素材，再把受管路径用于生成，不会自动压缩图片。超限错误会包含文件名、实际大小和上限；可压缩后重试，或先通过 App 导入，再用 `iterlay call` 传入受管路径。模型服务自身仍可能有更低的参考图限制。此修复需要更新 App 后台，仅更新 CLI 无法修复旧版 App 的导入校验。

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

新增视频服务使用 `providers set --kind video --type <协议> --base-url <地址> --model <模型>`，可用 `--provider` 自定 ID，省略则生成 ID。重复 `--saved-model <模型>` 会替换已保存列表，并始终包含 `--model` 指定的默认模型；省略则保留列表。`--default` 同时将此服务设为该类别默认服务。内置官方服务不可修改或删除，图片配置也支持 set/default/remove，使用 `--kind image`；文本配置暂不开放修改。

TTS 的 `--speech-endpoint` 默认 `/v1/audio/speech`，表示相对 `--base-url` 的接口路径；例如地址为 `https://api.openai.com/v1` 时可设 `/audio/speech`。模型及音色 ID 由服务商决定，保存配置不代表远端模型可用。`models list` 只列已保存模型，不查询远程目录。

凭证可通过 `--api-key-env <变量名>` 或管道配合 `--api-key-stdin` 输入，二者不可同时使用；查询仅返回 `authConfigured`。省略凭证选项会保留原密钥；`--clear-api-key` 显式清除。App 使用系统安全存储加密，独立模式使用工作区凭据密钥；无法加密时整次修改回滚。不要把真实密钥放进 `iterlay call --input`、聊天或日志。

fal / OpenRouter 视频可用 `--connection-provider <同类型图片服务ID>` 复用其地址和凭证。复用时不能设置独立密钥；用 `--connection-provider none` 解除关联，再设置独立连接。CLI 与 App 共用设置，需要配套运行包含此功能的新版后台服务；仅替换 CLI 无法让旧 App 支持配置操作。

`iterlay guard descriptor` 可离线输出随包携带的 HOL Guard 命令描述；它不会安装 Guard 或改变 Agent 权限。生成/编辑、文件导出、配置安装与通用调用按影响分类，最终决策仍受 Guard 全局策略控制。参见 [说明](../docs/guard.md)。

Coding Agent 在 App 的设置 → Coding Agent 中一键安装 `using-iterlay` Skill，或运行 `npx iterlay add --agent <id>`。支持 `codex`、`claude-code`、`workbuddy`、`cursor`、`windsurf`、`cline`、`roo-cline`、`gemini-cli` 和 `opencode`；省略 `--agent` 时自动安装到已检测到的 Agent。WorkBuddy 的安装位置为 `~/.workbuddy/skills/using-iterlay`。`using-iterlay` 仅供手动调用：Codex 使用 `$using-iterlay`，Claude Code 使用 `/using-iterlay`，其他支持 Skills 的 Agent 直接按其 Skill 调用语法使用。迁移会移除 Codex/Claude Code 原来的 Iterlay MCP 条目，保留其他服务。此版本不再提供 MCP server。

指定 `--user-data-path` 或 `ITERLAY_USER_DATA_PATH` 时只连接指定工作区，不自动启动另一个工作区。生成默认等待，`--async` 提交即返回；结束等待不会取消远端任务。导出失败后可重试导出，不必重新生成。

开发：`npm ci && npm run build`。发布前自动同步 App 的 Skill，版本保持一致。

### 原图保留与本地交付

生成请求的原生格式、尺寸不一定被上游兑现。CLI 先保存原图，再按 `--delivery-format png|jpeg|webp`、`--delivery-size WxH` 和 `--fit scale|cover|contain` 做本地交付；可选 `--delivery-quality 1..100` 控制 JPEG/WebP 编码质量。`scale` 只允许相近比例（误差≤5%）；`cover` 居中裁切，`contain` 保留完整画面并补边。

```sh
iterlay image generate --prompt '3:5 竖幅旅行摄影' --size auto \
  --delivery-format jpeg --delivery-size 1200x2000 --fit contain --out ./delivery.jpg

# 只用已有原图处理，不调用模型；job ID 使用 tasks get 返回的 job.id
iterlay image deliver --job <job-id> --delivery-format jpeg \
  --delivery-size 1200x2000 --fit cover --out ./delivery.jpg
```

`job.status=succeeded` 表示原图已生成保存，还需查看 `job.delivery.status`。本地处理失败保留原图，返回非零退出码且不执行 `--out` 导出；可调整交付参数后重试。原图位于 `originalImagePaths`，交付结果位于 `outputImagePaths`，两者分别有真实格式与尺寸元数据。放大不是原生高分辨率生成；JPEG 的透明区域铺白底。

带本地交付参数时，CLI 会先检查后台能力。旧 App 不支持时在导入素材、解析画板和提交生成前明确拒绝，请升级 App 或使用 `--standalone`。

Codex 账号自动采用原生 `auto` 尺寸与质量；ChatGPT OAuth 中转可显式设置 `iterlay providers set --kind image --provider <id> --image-control-mode automatic`。其他字段与密钥省略时保留。

### 本地切图

```sh
iterlay image slice --path <受管图片路径> --board <画板ID> --rows 3 --columns 4 --out ./avatars --json
iterlay image slice --input ./sheet.png --rows 3 --columns 4 --margin 12 --gap 8 --json
iterlay image slice --node <节点ID> --board <画板ID> --crops '[{"x":10,"y":20,"width":300,"height":300}]' --json
```

复用 App 本地切图，不调用模型；保留原图，切片保存为受管 PNG 并加入画板。源参数三选一，宫格与 crops 互斥；每轴最多 8 格、最多 64 个区域。坐标、边距和间距均为原图像素；不自动去底、识别主体或统一输出尺寸。返回 images、crops、nodeIds 和可选 exportedPaths；--out 为目录，已有文件默认不覆盖。高级入口为 `iterlay call slice_image --input '<JSON>' --json`，精确 schema 见 tools list。

### 可复用图片模板

模板规则保存到当前工作区的模板库，与 App 自定义模板共用。创建/更新模板不调用模型、不产生生成费用。

```sh
iterlay templates create --name "品牌海报" --prompt "米白背景、黑色大标题、充足留白" --category marketing
iterlay templates list
iterlay templates show 'custom:返回的ID'
iterlay templates update 'custom:返回的ID' --description "品牌系列海报"
iterlay image generate --template 'custom:返回的ID' --prompt "春季咖啡新品，标题：春日第一杯" --out poster.png
```

`--prompt` 在创建/更新时表示固定模板规则，在生成时表示本次内容；使用模板不会修改模板本身。生成记录保留模板 ID，结果沿用普通图片任务的等待、导出和画板流程。编辑模板使用 `--mode edit`，配合 `image edit --template ... --input ... --prompt ...`。

复杂模板可使用 `templates create --input template.json` 或 `templates update <id> --input patch.json`，支持 name、description、prompt、category、mode、useCase、fields（id/label/value）、extractionScenario；命令行字段覆盖文件中的同名字段。更新保留未提供的字段，修改 prompt 且未提供 fields 时清除旧结构字段。`--expected-prompt` 可拒绝覆盖已改变的规则。

目前列表包含自定义模板，不包含内置预设。旧版 localStorage 模板会在打开升级后的工作台时迁入共享库；首次迁移前，纯后台 CLI 无法读取这些旧模板。旧客户端不支持新接口，须使用同版本的 App 后台和 CLI。模板不保证模型输出像素级一致，仍需检查生成结果。
