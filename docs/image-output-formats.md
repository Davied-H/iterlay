# SVG 与 GIF 生成

画板输入区打开「生成设置」，在「输出格式」中选择格式。格式由当前图片模型的能力决定；切换到不支持该格式的模型会报错，不会把 SVG/GIF 请求静默改成 PNG。

## 模型配置

OpenAI 兼容的 Images API 支持显式输出格式。与 Leru 保持一致，`gpt-image-2.6-flare`、`gpt-image-2.6-sunburst` 及其日期版本默认提供 PNG、JPEG、WebP、SVG、GIF，SVG 作者模型默认为 `gpt-6.1-sol`。其他兼容图片模型默认只显示 PNG、JPEG、WebP。

设置 → AI 模型 → 图片连接 → 高级设置中，可按当前模型覆盖支持的输出格式及 SVG 作者模型。应以实际 Provider 权限为准；模型名称和本地配置不代表上游能力已验证。Codex 账号、Responses 及其他尚未接入此扩展协议的服务仍只提供原有 PNG 路径。

## 格式参数

- SVG：显式发送 `output_format=svg` 和 `svg.model`；仅支持无参考图的新作品生成。
- GIF：显式发送 `output_format=gif`、`frame_count`、`frame_duration_ms`；固定 512×512。默认 9 帧、每帧 200 毫秒，可选 4–16 帧、20–10000 毫秒且为 10 的倍数。可以传入已有的位图参考图，经 `/images/edits` 生成动画。
- 透明背景：只用于 PNG/WebP；选择 JPEG、SVG、GIF 时会关闭透明背景。
- SVG 不能直接作为模型参考图。SVG/GIF 当前不进入像素编辑器；预览、画板持久化和原文件下载保留各自格式。

实际返回格式与显式请求不一致时拒绝保存。SVG 按静态元素/属性白名单重新编码，清除脚本、事件、HTML、外链、样式表、SMIL 和内嵌位图，并限制尺寸、字节量和复杂度；不支持的效果会被移除。GIF 检查帧结构及展开像素预算，原始动画字节不转成 PNG。历史记录保留请求的格式、动画参数及实际输出元数据。

## AI 工具与 CLI

`list_providers` 返回当前模型能力，`list_models` 返回各已保存模型的格式能力。`generate_image`、`edit_image` 接受 `outputFormat`、`frameCount`、`frameDurationMs`；SVG 编辑不受支持。

```sh
iterlay image generate --model gpt-image-2.6-flare --prompt '蓝色圆点循环移动' \
  --output-format gif --size 512x512 --frames 9 --frame-duration-ms 200
```

## 验证

本地模拟上游覆盖 JSON SVG 作者参数、GIF 参考图 multipart 参数、实际格式识别、安全处理、任务历史、原文件预览和下载。独立网页开发目录已完成 SVG/GIF 生成、刷新恢复、390px 设置面板检查；截图间像素位置变化确认 GIF 在画板播放，下载文件与工作区保存文件逐字节一致。

这些验证不代表真实上游或生产账号的 SVG/GIF 权限已确认；本次未调用付费生成服务，未发布桌面安装包。
