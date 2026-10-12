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
pnpm electron:dev
```

运行项目检查：

```bash
pnpm test
pnpm lint
pnpm build
```

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

`pnpm package` 生成应用目录，产物位于 `release/`。`pnpm release` 在 macOS Apple 芯片机器上构建未签名、未经公证的 ARM64 DMG，并校验内置 FFmpeg；不上传安装包，不需要官方管理密钥，不提交或推送 Git。

打包需安装 Xcode Command Line Tools 和 `brew install pkgconf`，FFmpeg 与 x264 从固定版本源码编译，不包含 nonfree。当前资源准备仅支持 macOS ARM64，其他平台尚未配置完整打包依赖。签名、公证和安装包分发由维护者自行配置；详见[第三方说明](THIRD_PARTY_NOTICES.md)。

## 许可证

项目原创代码采用 [MIT 许可证](LICENSE)。第三方依赖及资源遵循各自许可证，参见[第三方说明](THIRD_PARTY_NOTICES.md)。
