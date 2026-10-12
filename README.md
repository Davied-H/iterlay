# Iterlay

Iterlay 是面向专业设计师的 Electron AI 图片生产工作台，以无限画布连接图片生成、编辑、引用、切图、版本、历史、评论和素材管理。

## 本地开发

要求 Node.js 22.12+、pnpm 10。macOS 开发还需要 Xcode Command Line Tools（`xcode-select --install`）；原生图片分层组件使用 macOS 14 SDK。

```bash
pnpm install
pnpm electron:dev
```

常用检查：

```bash
pnpm test
pnpm lint
pnpm build
```

## 开源范围与服务依赖

本仓库包含 Electron 桌面端、画布界面、AI 集成和 CLI。AI 功能需要自行配置对应服务商的 API Key，调用费用由服务商收取。

当前客户端保留试用与激活逻辑，默认连接 Iterlay 官方服务。授权、账户及更新服务端不包含在本仓库中；源码采用 MIT 许可证，官方服务的访问资格与源码许可证分别管理。开发时可通过 `ITERLAY_LICENSE_API_URL` 和 `ITERLAY_UPDATE_API_URL` 指定兼容服务地址。

源码支持开发与构建，不代表各平台安装包均已验证。当前 FFmpeg 自动准备脚本仅配置 macOS ARM64 资源，其他平台打包需要补齐对应资源配置。

## 贡献与许可证

欢迎通过 GitHub Issues 报告问题，通过 Pull Request 提交改进。贡献前请阅读 [贡献指南](CONTRIBUTING.md)。项目原创代码采用 [MIT 许可证](LICENSE)；第三方依赖及资源遵循各自许可证，参见 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 本地打包

```bash
pnpm build
pnpm package
```

`pnpm package` 生成未分发的应用目录，产物位于 `release/`。`pnpm release` 依次执行构建与本地打包，不上传安装包，不需要官方管理密钥，不提交或推送 Git。

当前 FFmpeg 自动资源准备仅支持 macOS ARM64。制作其他平台安装包前，需要配置相应 FFmpeg 资源。签名、公证及安装包分发由各自维护者自行配置；本仓库不包含官方商业发布配置或签名私钥。

## 官网与下载

[开源官网](https://davied-h.github.io/iterlay/) · [下载页](https://davied-h.github.io/iterlay/#/download) · [GitHub Releases](https://github.com/Davied-H/iterlay/releases)

网站源码与本地开发说明见 [website/README.md](website/README.md)。
