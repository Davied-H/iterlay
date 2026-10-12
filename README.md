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

## 维护者发布流程

发布脚本为 [`scripts/release.sh`](scripts/release.sh)，需要在 macOS 上运行。一次执行会完成：

1. 升级 `package.json` 版本。
2. 将当前工作区全部改动加入 Git，并创建发布提交。
3. 运行依赖校验、测试、Lint 和构建。
4. 打包 macOS ARM64、macOS Intel DMG 与 Windows x64 NSIS EXE。
5. 原子推送当前默认分支和 `v<版本>` tag。
6. 在 Gitea 创建正式 Release，并上传三个安装包作为附件。
7. 将安装包上传到 iterlay-manage，并正式发布 macOS ARM64、macOS Intel 与 Windows x64 版本。
8. 复核三个客户端版本均已进入公开下载渠道。

### 前置条件

- 当前系统为 macOS，并已安装 Node.js、pnpm、Wine、Git、curl、jq 和 `shasum`。
- 当前分支是 Gitea 仓库默认分支，且没有未解决的合并冲突。
- Gitea 地址和令牌已配置在 `~/Config/openapi.sh`，变量名为 `GITEA_BASE_URL` 和 `GITEA_ADMIN_TOKEN`。
- iterlay-manage 已部署安装包上传接口 `POST /api/v1/admin/releases/upload`，并挂载了安装包持久卷。

脚本会执行 `git add -A`。运行前先用 `git status` 确认当前工作区的所有改动都应进入本次发布。

### 首次配置

创建本地发布配置：

```bash
cp scripts/release.env.example .env.release
chmod 600 .env.release
```

编辑 `.env.release`，填写 manage 管理密钥：

```bash
ITERLAY_ADMIN_API_KEY=replace-with-the-manage-admin-key
ITERLAY_MANAGE_API_URL=https://iterlay.daived.com:31243/api/v1
```

`.env.release` 已被 Git 忽略，不要把真实密钥写入 `scripts/release.env.example` 或提交到仓库。

### 发布命令

默认将当前版本升级一个 patch，例如 `0.1.6 -> 0.1.7`。执行前会显示发布预览并要求确认：

```bash
pnpm release -- --message "feat: add desktop updater"
```

跳过确认，全自动执行：

```bash
pnpm release -- --yes --message "feat: add desktop updater"
```

建议首次使用先做预检；预检会检查 Git、Gitea 和 manage，但不会修改版本、提交代码或写入远端：

```bash
pnpm release -- --dry-run
```

### 参数

| 参数 | 作用 | 示例 |
| --- | --- | --- |
| `--bump patch\|minor\|major` | 按类型升级版本，默认 `patch` | `--bump minor` |
| `--version <x.y.z>` | 指定新版本，必须高于当前版本 | `--version 1.0.0` |
| `--message <text>` | 指定 Git 发布提交信息 | `--message "feat: updater"` |
| `--channel stable\|beta` | 指定发布渠道，默认 `stable` | `--channel beta` |
| `--notes <text>` | 直接指定 Gitea/manage 发布说明 | `--notes "修复更新检查"` |
| `--notes-file <path>` | 从文件读取发布说明 | `--notes-file ./release-notes.md` |
| `--yes` | 跳过最终确认 | `--yes` |
| `--dry-run` | 只执行发布预检 | `--dry-run` |
| `--resume <x.y.z>` | 继续中断的同版本发布 | `--resume 0.1.7` |

完整帮助：

```bash
pnpm release -- --help
```

### 常用场景

升级 minor 版本并正式发布稳定版：

```bash
pnpm release -- --bump minor --channel stable --message "feat: new workflow"
```

发布指定版本并读取独立发布说明：

```bash
pnpm release -- --version 1.0.0 --notes-file ./release-notes.md
```

网络、Gitea 或 manage 上传中断后，继续已经写入 `package.json` 的同一版本：

```bash
pnpm release -- --resume 0.1.7 --yes
```

恢复模式会复用哈希一致的 Gitea 附件和 manage 版本；如果同名产物或同版本内容不一致，脚本会停止，不会覆盖远端文件。部分平台已经发布、部分平台仍为草稿时，也会继续完成剩余平台并复核最终状态。

如果对应 tag 已经推送且指向当前 `HEAD`，脚本会自动进入“远端阶段恢复”：跳过版本升级、`git add`、提交、测试、编译、重新打包以及 tag 推送，直接复用 `release/` 中同版本的 DMG/EXE，继续处理 Gitea Release 和 manage 正式发布。此时允许工作区存在其他未提交改动，脚本不会暂存或修改这些文件；若本地安装包缺失，则会明确报错并停止。

### 发布结果

成功后可在以下位置检查：

- 本地产物：`release/*.dmg`、`release/*.exe`
- Git tag：`v<版本>`
- Gitea：对应 tag 的正式 Release 与三个安装包附件
- iterlay-manage：macOS ARM64、macOS Intel、Windows x64 三个正式版本

manage 中的安装包由服务端计算 SHA-256，并通过公开下载接口提供给桌面端更新模块。Gitea 仓库可以保持私有，客户端更新不依赖 Gitea 附件地址。
