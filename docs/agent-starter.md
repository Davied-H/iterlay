# FIELD：从 Agent 到网站素材

[English](agent-starter.en.md) · [实际制作记录](readme-example.md)

用一个完整的虚构音箱案例，体验 Coding Agent 生成、改图、比较版本与交付到项目的过程。可以先使用已有结果，**不必调用模型或付费生成**。

## 先拿到能用的结果

1. 在官网 Agent 页面下载 `field-starter.zip`，解压后直接打开 `site/index.html`。这是可以离线使用的静态网页，不需要构建、账号或第三方 CDN。橙色和绿色按钮切换真实原图与改图结果。
2. 在 Iterlay 画板列表点击「导入画板」，打开 `field-starter.itb`。也可将 `.itb` 拖入工作台。导入后找到「FIELD · 便携音箱视觉探索」。如有同名画板，根据导入时间确认，勿在其他画板操作。
3. 画板保留陶土橙原图、绿色编辑节点、户外图和海报。选择绿色节点可查看真正的橙色 v1 → 绿色 v2 版本链。橙色是原图，也是其余三张的参考；绿色是编辑变体。
4. 打开设置 → Coding Agent，完成 CLI 和对应 Agent 的 Skill 安装。在项目终端中调用：Codex 输入 `$using-iterlay`；Claude Code 输入 `/using-iterlay`。手动启用入口后，按下方任务交付三张已有图。

首次安装后的旧终端可能需要重开；也可使用设置中显示的 CLI 启动器路径。CLI 为建立本地连接可能启动 Iterlay。无需读取 App 设置文件或把 API Key 交给 Agent。

## 给 Agent 的交付任务

先输入对应 Skill 调用，再粘贴：

> 使用 Iterlay 交付我已导入的 FIELD 示例，不调用模型。先运行 `iterlay status --json`、`iterlay boards list --json`，找到「FIELD · 便携音箱视觉探索」，再运行 `iterlay boards show <返回的画板 ID> --json` 检查节点与版本。同名时让我选择；ID 在导入后会变化，不要使用原示例 ID。选择橙色原始产品图作为 `hero.png`、户外图作为 `scene.png`、海报作为 `campaign.png`。绿色是编辑变体，保留橙→绿版本链。用 `iterlay assets export --path <实际托管路径> --out <目标路径> --json` 导出到 `./public/iterlay-starter/`。不覆盖现有文件，不使用 `--overwrite`。确认三个文件存在及实际尺寸，返回对应节点/版本和路径。

目前 CLI 没有 `.itb` 画板包导入命令；导入需在 App 中完成。需要切换已有版本时，先用 `iterlay tools list --json` 读取 `set_image_version` 的实际 schema，再按返回契约操作，不要重新生图。

| 文件 | 来源 | 网站用途 |
| --- | --- | --- |
| `hero.png` | 陶土橙原图 | 首屏产品主图 |
| `scene.png` | 以原图为参考的户外结果 | 使用场景区域 |
| `campaign.png` | 以原图为参考的海报结果 | 品牌宣传区域 |
| `sage-variant.png`（可选） | 橙色 → 绿色真实编辑 | 配色切换；非必需交付 |

示例 HTML 使用体积更小的 WebP 副本；Agent 导出的是 `.itb` 中的真实生成 PNG。两者实际尺寸均为 1254 × 1254，没有把 WebP 改名为 PNG。

## 再做你自己的第一张图

官网和 App 安装向导提供三种任务：「准备检查」「生成第一张」「交付已有案例」。准备检查只报告本地连接和已有配置，不调用模型。CLI 能列出模型服务配置，不代表已实测远端可用，也不能据此判断 Skill 已加载。

「生成第一张」先说明所选 Provider、模型和费用来源，等你确认后只生成 1 张，导出到 `./public/iterlay-starter/hero.png`。同名文件默认保留。生成成功但导出失败时，应从原任务重新导出，避免重复付费请求。

## 回看真实版本

[观看 FIELD 版本检查录屏](../website/public/examples/field/field-review.mp4)：在真实网页工作区打开已有结果，切换橙色原版与绿色编辑版，再拖动对比分界线。录屏使用已有素材，不调用模型。完整示例项目中也包含这段视频。

## 来源、模型与复现边界

- 2026-10-16，Codex 通过 Iterlay CLI 在隔离的网页开发工作区真实完成四张图。`.itb` 从原始画板与四条成功历史导出，保留原始布局、PNG 字节、真实时间与版本关系；仅补充了交付说明并移除 Provider 名称/ID、本机路径等私有信息。
- `prompts.json` 保存实际完整提示词、原任务 ID、输出校验值、参考角色与交付映射。`.itb` 中的 `history.json` 保留实际生成/编辑输入；不是根据图片编造的执行记录。
- 原模型为 OpenAI-compatible 服务中的 `gpt-image-1`，请求 1024 × 1024，实际返回 1254 × 1254。最早请求因默认 `style` 参数被拒绝；成功任务使用空 `style`，没有隐去“重试后才成功”的边界。
- 导入与导出已有结果不调用模型。重新运行提示词需使用你自己的 Provider，按供应商规则计费。不同模型和服务可能改变尺寸、产品形状、参考一致性与文字质量，不保证逐像素复现。
- 画板连线用于解释视觉关系，并非自动执行工作流。示例 HTML 是本次新增的素材落地展示，没有伪装成原生成任务的一部分。

## 开发者维护

`node scripts/build-agent-starter.mjs` 从已提交的 `.itb` 重建分发包并验证素材来源，不连接模型。只有需要重新从文档指定的隔离开发画板导出时使用 `node scripts/build-agent-starter.mjs --from-dev`。脚本不会访问已安装 App 的正式数据，也不会读取 Provider 配置。
