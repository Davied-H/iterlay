# Iterlay

**自带模型 Key 的 AI 视觉创作工作台，让你和 Agent 在无限画布上生成、修改图片与视频。**

[English](README.md) · 简体中文

<!-- 待补充 60～90 秒真实操作录屏：展示发起生成、实际等待、根据结果修改，以及最终图片与视频；加速或剪辑需明确标注。不要用动画或截图轮播代替真实操作。 -->

## 下载与开始使用

[下载安装包](https://github.com/Davied-H/iterlay/releases) · [按平台选择版本](https://davied-h.github.io/iterlay/#/download) · [官网](https://davied-h.github.io/iterlay/)

1. 下载适合系统的安装包，安装并打开 Iterlay。可用版本以 Releases 为准，下载页按 Apple 芯片 Mac、Intel Mac 和 Windows x64 分类。
2. 在设置中配置需要的 AI 服务商、API Key 和模型；无需激活或试用。
3. 创建画板，输入提示词生成图片或视频；需要修改时，选择结果作为参考继续创作。

要让 Codex 或 Claude Code 操作画布，在安装桌面端后运行：

```bash
npx iterlay add
```

CLI 会自动检测已安装的 Agent，安装 Iterlay Skill 并配置 MCP 服务。详见 [Agent 集成指南](cli/README.md)。

## Chat、Image 与 Video 供应商

- **Chat（对话与创作助手）：** OpenAI 兼容接口、Codex OAuth。
- **Image（图片生成与编辑）：** OpenAI 兼容接口、OpenRouter、阿里云百炼、火山方舟、Poe、fal.ai、Codex OAuth。
- **Video（视频生成）：** 火山方舟、fal.ai、OpenRouter、MiniMax。

三类能力分别配置；接入某个供应商不代表它同时支持 Chat、Image 和 Video。自定义接口需填写对应的服务地址、API Key 和模型；Codex OAuth 使用账号授权。图片编辑、文生视频、图生视频等能力及参数以所选模型和接口为准。自带 Key 的调用费用由对应供应商收取。

## 开源范围与服务依赖

Iterlay 永久免费，所有功能无需激活或试用。桌面端、画布、AI 集成、CLI 和官网的原创代码采用 MIT 许可证。

客户端不提供 Iterlay 官方模型服务、积分或购买入口。请配置自己的模型 Provider（API Key 或 Codex 账号）；模型调用费用由对应服务商收取。更新与安装包通过 GitHub Releases 提供，不依赖原付费版的授权、账户或更新服务。

## 画布工作流

![Iterlay 无限画布工作台截图](website/public/iterlay-demo-board.png)

- **无限画布：** 把图片、参考与创作结果放在一起，保留上下文。
- **生成与修改：** 使用 AI 生成图片和视频，以参考素材继续迭代。
- **参考与切图：** 引入已有图片，拆分为可复用素材。
- **版本与历史：** 比较图片版本，回顾生成记录。
- **素材管理：** 在画板与工作空间中组织创作素材。

## 本地开发

环境要求：

- Node.js **22.12+**、**pnpm 10**。
- macOS 需要 Xcode Command Line Tools（`xcode-select --install`）；原生图片分层组件使用 macOS 14 SDK。

```bash
pnpm install
pnpm dev
```

在浏览器打开 **http://127.0.0.1:5180**。`pnpm dev`（或 `pnpm dev:web`）会同时启动 Vite 和隐藏的 Electron 服务进程，网页调用真实的画板、设置、生成任务和原生媒体服务。渲染层修改支持热更新；Electron 服务修改后会自动重新构建并重启后台。按 Ctrl+C 停止全部开发服务。

后台重启和退出前会等待画板保存。如果保存失败导致工作区继续运行，开发服务会保留连接并暂停自动重启；先在网页处理保存错误，再按 Ctrl+C 重试。启动器不会强制结束仍在编辑的工作区。

网页开发数据独立保存在 `tmp/browser-dev/user-data/`，与已安装 App 的数据分开；可通过 `ITERLAY_BROWSER_DEV_USER_DATA` 指定其他开发目录。带鉴权的桥接服务仅监听本机回环地址，并且只在此开发模式下启用。打包后的 App 继续通过 Electron IPC 工作。

日常调试和验证默认在网页进行。仅在用户明确要求 App 测试时运行 `pnpm electron:dev`，用于验证原生窗口、应用生命周期等桌面行为。`pnpm dev:ui` 保留不启动后台服务的独立 Vite 预览入口。

运行项目检查：

```bash
pnpm setup:subprojects
pnpm check:all
```

`setup:subprojects` 按 CLI 和官网各自的 lockfile 安装依赖；`check:all` 覆盖四个项目的类型检查、lint、测试和构建。局部检查可运行 `pnpm typecheck`、`pnpm lint`、`pnpm test`。构建 Electron 后可运行 `pnpm bench:storage` 获取独立临时数据的存储基准；架构、日志格式、兼容边界与验证结果见[工程说明](docs/engineering.md)。

### 仓库结构

- `src/` — React 画布与桌面界面。
- `electron/` — Electron 主进程与桌面服务。
- `cli/` — Coding Agent 集成 CLI，见[使用文档](cli/README.md)。
- `website/` — 产品官网与下载页，见[开发指南](website/README.md)。
- `resources/` — 随应用分发的 Skill、图标与原生资源。
- `docs/` — 产品说明与维护者文档。

## 参与贡献

欢迎通过 [GitHub Issues](https://github.com/Davied-H/iterlay/issues) 报告问题，通过 Pull Request 提交改进。贡献前请阅读[贡献指南](CONTRIBUTING.md)。

## 本地打包

```bash
pnpm build
pnpm package
```

`pnpm package` 生成应用目录，产物位于 `release/`。`pnpm release` 在 macOS Apple 芯片机器上构建未签名、未经公证的 ARM64 DMG，保持 UDZO 压缩。两条命令都会检查安装后的内容：不含仅用于渲染层的依赖目录、生产 JavaScript source map 或内置 FFmpeg；应用与 ASAR 的体积上限分别为 380 MiB、120 MiB，报告写入 `output/package-size/report.json`。这些命令不上传安装包，不需要官方管理密钥，不提交或推送 Git。

首次执行需要视频工具的操作时，应用会先提示，确认后才从 GitHub Releases 下载固定版本组件并校验 SHA-256。组件保存在 Electron 用户数据目录的 `tools/ffmpeg/ffmpeg6-r1/darwin-arm64/` 下，安装后可离线复用，更新应用也会保留。下载失败或取消时，不会提交新的序列生成任务或产生对应生成费用；普通启动和图片功能不会下载组件。

维护者在 macOS Apple 芯片机器上单独构建组件，需要 Xcode Command Line Tools 和 `brew install pkgconf`：

```bash
pnpm media-tools:build --version ffmpeg6-r2
pnpm media-tools:verify
```

构建使用固定版本 FFmpeg 6.0 与 x264 源码，不启用 nonfree，保持现有 codec 配置；产物位于 `output/media-tools/<version>-darwin-arm64/`，包含两个工具、许可证、对应源码压缩包和构建信息，并把归档及逐文件的真实哈希写入 `shared/media-tools-manifest.json`。组件版本不可变，修改构建时须用新的 `--version`；无参数会验证并复用本地已匹配的归档，`--rebuild` 只在独立目录生成诊断候选，若哈希不同会拒绝覆盖固定版本。当前 `ffmpeg6-r1` 的资产为 GitHub Release `media-tools-ffmpeg6-r1` 上的 `iterlay-media-tools-ffmpeg6-r1-darwin-arm64.zip`。发布引用新组件的应用前，须先由维护者单独上传对应资产。其他平台尚未配置完整打包依赖。签名、公证和安装包分发由维护者自行配置；详见[第三方说明](THIRD_PARTY_NOTICES.md)。

## 许可证

项目原创代码采用 [MIT 许可证](LICENSE)。第三方依赖及资源遵循各自许可证，参见[第三方说明](THIRD_PARTY_NOTICES.md)。
