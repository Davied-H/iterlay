# 开发与打包指南

[返回项目介绍](../README.zh-CN.md)

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

`setup:subprojects` 按 CLI 和官网各自的 lockfile 安装依赖；`check:all` 覆盖四个项目的类型检查、lint、测试和构建。局部检查可运行 `pnpm typecheck`、`pnpm lint`、`pnpm test`。构建 Electron 后可运行 `pnpm bench:storage` 获取独立临时数据的存储基准；架构、日志格式、兼容边界与验证结果见[工程说明](engineering.md)。

### 仓库结构

- `src/` — React 画布与桌面界面。
- `electron/` — Electron 主进程与桌面服务。
- `cli/` — Coding Agent 集成 CLI，见[使用文档](../cli/README.md)。
- `website/` — 产品官网与下载页，见[开发指南](../website/README.md)。
- `resources/` — 随应用分发的 Skill、图标与原生资源。
- `docs/` — 产品说明与维护者文档。

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

构建使用固定版本 FFmpeg 6.0 与 x264 源码，不启用 nonfree，保持现有 codec 配置；产物位于 `output/media-tools/<version>-darwin-arm64/`，包含两个工具、许可证、对应源码压缩包和构建信息，并把归档及逐文件的真实哈希写入 `shared/media-tools-manifest.json`。组件版本不可变，修改构建时须用新的 `--version`；无参数会验证并复用本地已匹配的归档，`--rebuild` 只在独立目录生成诊断候选，若哈希不同会拒绝覆盖固定版本。当前 `ffmpeg6-r1` 的资产为 GitHub Release `media-tools-ffmpeg6-r1` 上的 `iterlay-media-tools-ffmpeg6-r1-darwin-arm64.zip`。发布引用新组件的应用前，须先由维护者单独上传对应资产。其他平台尚未配置完整打包依赖。签名、公证和安装包分发由维护者自行配置；详见[第三方说明](../THIRD_PARTY_NOTICES.md)。
