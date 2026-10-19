# README 示例：FIELD 便携音箱

[返回中文 README](../README.zh-CN.md) · [English README](../README.md)

2026-10-16 制作。FIELD 是为此次演示构思的虚构音箱品牌。示例展示三个核心优势：在同一画布保留创作上下文、基于已有图片编辑并比较版本，以及 Coding Agent 复用 App 配置完成生成和素材导出。

## 实际制作过程

1. 在独立的网页开发工作区创建「FIELD · 便携音箱视觉探索」画板。
2. Codex 通过 Iterlay CLI 调用已配置的图片服务，生成陶土橙音箱主图。
3. 对主图执行 `edit_image`，仅将外壳、网罩与按键改为鼠尾草绿；原图与编辑结果形成真实的 v1 / v2 版本链。
4. 以橙色主图为参考，分别生成户外场景与品牌海报。
5. 保留橙色主图副本，将简报、配色版本、场景和海报整理到同一画板，添加说明与视觉关系连线，再通过 CLI 导出四张结果。
6. 在 `pnpm dev` 的真实网页界面中，操作图片编辑助手和版本对比滑块，截取画布总览及功能局部。

所有图片均通过 Iterlay 实际生成；界面截图来自当前产品，没有绘制或拼造 UI、对话或生成记录。编辑助手截图停在修改目标选择阶段；截图中的提问不是一次额外图片生成。版本对比使用实际完成的橙色到绿色编辑。连线是人工整理的视觉说明，不代表自动创建的执行工作流。

## 示例素材

- [橙色产品主图](assets/readme/examples/field-studio.webp)
- [绿色编辑版本](assets/readme/examples/field-sage.webp)
- [户外场景](assets/readme/examples/field-outdoor.webp)
- [品牌海报](assets/readme/examples/field-poster.webp)
- [完整提示词与任务记录](assets/readme/examples/prompts.json)

四张图片的实际尺寸均为 **1254 × 1254**。模型服务未按请求的 1024 × 1024 返回，因此示例保留真实尺寸，并核对了画板元数据与文件尺寸。仓库中保存的是生成 PNG 的 WebP 副本，像素尺寸保持不变。

## README 截图

- [画布总览](assets/readme/field-canvas.webp)：1600 × 1000，完整网页视口。
- [图片编辑助手](assets/readme/field-edit.webp)：740 × 940，网页局部截图。
- [版本滑块对比](assets/readme/field-versions.webp)：730 × 682，网页局部截图。

截图使用 WebP 压缩，共约 317 KiB。只做截图取景与格式压缩，没有重绘界面。旧官网图片仍保留，README 改用此次新增的独立素材。

## 后续更新

日常截图继续使用 `pnpm dev` 网页模式及独立开发数据。复用以上素材时，可以直接导入[FIELD 画板包](../website/public/examples/field/field-starter.itb)，保留原始 PNG、真实任务历史和橙色到绿色版本链；完整使用方法见[Agent 首次交付案例](agent-starter.md)，也可打开[静态网站落地示例](../website/public/examples/field/site/index.html)。仅导入单张图片不会恢复版本链。原始开发画板 ID 为 `bb9c89f5-d280-4269-94c7-9fa64390afb4`，它仅存在于本地开发工作区，不是公开分享链接；画板包导入后会获得新的 ID。

模型输出会随服务与时间变化，提示词用于复现创作思路，不保证逐像素一致。此次首次请求因接口拒绝默认 `style` 参数而失败；确认任务失败后，以空 `style` 参数重新提交并成功，未伪装成首次请求即成功。该参数处理仅用于此次示例调用，没有修改应用或供应商实现。
