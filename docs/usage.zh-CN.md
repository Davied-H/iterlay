# 使用指南与常见问题

[返回 README](../README.zh-CN.md)

1. **下载安装。** 前往[下载页](https://davied-h.github.io/iterlay/#/download)选择系统版本；实际可用安装包以 [GitHub Releases](https://github.com/Davied-H/iterlay/releases) 为准。
2. **连接模型。** 在设置中添加供应商、API Key 和模型，或使用 Codex 账号授权。
3. **创建第一张画板。** 导入参考图或输入提示词，生成后选中结果继续修改。

### 支持哪些模型服务？

- **图片生成与编辑：** OpenAI 兼容接口、OpenRouter、阿里云百炼、火山方舟、Poe、fal.ai、Codex OAuth。
- **视频生成：** 火山方舟、fal.ai、OpenRouter、MiniMax。
- **对话与创作助手：** OpenAI 兼容接口、Codex OAuth。

三类能力分别配置。图片编辑、参考图、文生视频、图生视频及可用参数取决于具体模型与接口；接入某个供应商不代表它支持全部能力。Iterlay 不提供官方模型积分或代充值服务。

## 想让 Agent 帮忙？也可以

先看 [FIELD 完整案例](https://davied-h.github.io/iterlay/zh/agents/)：打开成品示例网页，下载包含真实图片与版本历史的画板，再复制准备、创作和交付任务。打开案例不会调用模型；创建新图片会使用你配置的服务商。

给 Codex 或 Claude Code 一套能执行的视觉工具，让生成的素材进入你的实际工作流。

安装并打开 Iterlay、配置模型后，在 **设置 → Coding Agent** 中安装 Skill，或在终端运行：

```bash
npx iterlay add --agent codex
# 或：npx iterlay add --agent claude-code
```

然后向 Agent 提出具体任务，例如：

> 用 Iterlay 为 FIELD 便携音箱做一组视觉素材：先生成橙色产品主图，再探索绿色配色、户外场景和品牌海报。把结果整理在一个画板里，并导出到项目的 assets 目录。

App 首次打开时会自动安装随包 CLI。Agent 通过 Skill 调用 CLI，复用 App 中已保存的供应商与授权。当前版本使用 **CLI + Skill** 接入；迁移时会移除该 Agent 旧的 Iterlay MCP 配置。

也可以直接在终端使用：

```bash
iterlay image generate --prompt "暖色调、极简风格的咖啡杯插画" --out ./coffee.png --json
iterlay image edit --input ./coffee.png --prompt "把杯子改成米白色" --out ./coffee-light.png --json
```

更多用法见 [CLI 与 Agent 集成指南](../cli/README.md)。

## 常见问题

<details>
<summary><strong>免费吗？需要激活码吗？</strong></summary>

应用永久免费，无需激活，原创代码采用 MIT 许可证。模型调用由你选择的供应商计费；Iterlay 不售卖模型积分。

</details>

<details>
<summary><strong>不用 Coding Agent，也能正常使用吗？</strong></summary>

可以。直接在桌面画布里导入、生成、编辑、对比和导出即可。CLI 与 Skill 是自动化同一工作区的可选方式。

</details>

<details>
<summary><strong>可以离线使用吗？数据保存在哪里？</strong></summary>

画板与素材保存在本机。调用远程生成或对话模型时需要联网，并将相关提示词与参考素材发送给所选供应商。本地存储不代表远程模型能离线运行。

</details>

<details>
<summary><strong>列出的供应商都支持所有功能吗？</strong></summary>

不一定。图片编辑、参考图数量、透明背景、视频时长、首尾帧、改编与延长等能力取决于供应商和具体模型。图片、视频、文本能力需要分别配置。

</details>

<details>
<summary><strong>不花生成费用，也能体验案例吗？</strong></summary>

可以。打开 [FIELD 成品网页](https://davied-h.github.io/iterlay/zh/agents/)，或导入[示例画板包](../website/public/examples/field/field-starter.itb)。查看已有素材不会调用模型；生成新版本才会使用你配置的服务。

</details>

<details>
<summary><strong>网页开发模式是在线 SaaS 吗？</strong></summary>

不是。`pnpm dev` 是浏览器前端配合本地隐藏 Electron 服务，使用隔离的开发数据。普通使用请下载桌面安装包。

</details>
