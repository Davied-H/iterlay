# Iterlay

免费开源的 AI 创作工具，在一张画布上生成、编辑和整理图片与视频，也可以通过 CLI 交给 Coding Agent 操作。画板与素材保存在本机，模型调用由你选择的供应商计费。

[English](README.md) · [官网](https://davied-h.github.io/iterlay/zh/) · [下载安装包](https://github.com/Davied-H/iterlay/releases)

## 通过 Coding Agent 快速安装

把下面这段话发给 Codex、Claude Code 或其他 Coding Agent：

```text
帮我安装 Iterlay：https://github.com/Davied-H/iterlay
先读取 README 和 cli/README.md，检查当前系统与已有安装。
有桌面环境时，下载 Releases 中适合当前系统和架构的 App 安装包，
安装后运行 iterlay add --agent <当前 Agent 的 ID> 安装 using-iterlay Skill。
没有对应安装包或只需要 CLI 时，按 README 的「仅安装 CLI」从源码安装。
完成后检查 CLI、Skill 和连接状态；缺少模型配置时告诉我需要补什么，不自动生成图片。
```

装好后，Codex 输入 `$using-iterlay`，Claude Code 输入 `/using-iterlay`，再描述要生成、修改或导出的素材。

## 手动安装

1. 从 [Releases](https://github.com/Davied-H/iterlay/releases) 下载适合系统和架构的安装包，安装并打开 Iterlay。可用平台以发布附件为准。
2. 在设置中添加模型供应商、API Key 和模型，或使用 Codex 账号授权。
3. 创建画板，导入参考图或输入提示词，开始生成和编辑。

需要连接 Coding Agent 时，在 **设置 → Coding Agent** 安装 Skill，或在终端运行：

```bash
npx iterlay add --agent codex
# Claude Code 用户改用：npx iterlay add --agent claude-code
```

App 首次启动会自动安装随包 CLI，旧终端可能需要重开。安装 Skill 的命令需要 Node.js 22.12+。

## 仅安装 CLI

不需要 App 或 Electron，适用于终端和无桌面服务器。需要 Git、Node.js **22.12+** 和 npm。当前独立运行能力尚未发布到 npm，请从包含此功能的源码构建：

```bash
git clone https://github.com/Davied-H/iterlay.git
cd iterlay
npm ci --prefix cli
npm run build --prefix cli
npm install -g ./cli
iterlay status --standalone --json
```

本地目录安装会链接到源码，请保留该目录。配置图片模型后即可生成（先在本机设置 `OPENAI_API_KEY` 环境变量）：

```bash
iterlay providers set --standalone --kind image --provider images \
  --base-url https://api.openai.com --model gpt-image-1 \
  --api-key-env OPENAI_API_KEY --default --json
iterlay image generate --standalone --prompt "极简咖啡杯插画" --out ./cup.png --json
```

CLI 可用 `iterlay add --agent codex` 安装 Skill。独立模式使用单独的工作区，不会自动同步 App 的配置、授权和画板；`--standalone` 可明确指定此模式。后台托管、打包安装与更多命令见 [独立运行指南](docs/cli-standalone.md) 和 [CLI 文档](cli/README.md)。

## 已开发功能

以下为当前源码已实现的功能，旧安装包可能尚未包含；生成能力取决于所选供应商与模型。

| 功能 | 已实现内容 |
| --- | --- |
| 画布与画板 | 无限画布，图片／文本／视频节点，分组连线，布局，多画板搜索，撤销重做，自动保存与回收站 |
| 图片生成与编辑 | 文生图、参考图生成、自然语言改图、标注与蒙版需求、版本切换和滑块对比 |
| 图片格式与交付 | 保留原图，本地转 PNG／JPEG／WebP，缩放、裁切或留白；交付失败可单独重试；SVG／GIF 需通过真实生成验证 |
| 视频 | 文生视频、图生视频，按模型支持首尾帧／改编／延长，任务跟踪，序列编辑与 MP4 导出 |
| 模板 | 创建、整理、导入导出，从图片提炼模板，结合参考组织提示词 |
| 素材管理 | 素材库，跨画板整理，切图，单图／ZIP 导出，`.itb` 画板包导入导出，静态与动态表情素材导出 |
| Coding Agent 与 CLI | 安装 Skill，生成与编辑，管理画板／模板／素材，查询任务，JSON 输出，独立 Node 后台与服务器运行 |
| 模型与设置 | 多供应商、API Key 与 Codex 授权，本地存储，中英文界面及主题 |
| 实验扩展 | 工具插件、短剧助手、图片重建与图层／PSD 导出 |

详细说明：[完整功能清单](docs/features.zh-CN.md) · [使用与常见问题](docs/usage.zh-CN.md) · [创作流程与案例](docs/creative-workflow.zh-CN.md) · [产品故事](docs/product-story.zh-CN.md) · [开发与打包](docs/development.zh-CN.md) · [社区与许可证](docs/community.zh-CN.md)

[MIT 许可证](LICENSE) · [第三方说明](THIRD_PARTY_NOTICES.md)
