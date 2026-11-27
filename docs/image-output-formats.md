# 图片原图与本地交付

画板输入区打开「生成设置」。「原生输出格式」和尺寸是发送给上游的请求，不能据此认定模型实际兑现了格式和像素。应用先保存并记录真实原图，再处理本地交付；原图可在历史、版本和画板归档中追溯。

## 本地交付与恢复

启用「本地交付」可选择 PNG/JPEG/WebP、目标像素及适配方式。留空像素保留原始尺寸；填写如 `1200x2000` 后点击「应用」。原生 PNG 返回给 JPEG 请求时，也会在保存原图后尝试本地编码，而不是丢弃已经生成的图片。

- 比例接近时缩放：比例相对误差最多 5%；偏差较大时停止交付，保留原图。
- 裁切填满：居中裁切到目标比例，再输出指定像素。
- 完整留白：保留整个画面，缩放并补边到指定像素。
- 放大不增加原生细节；JPEG 不支持透明，交付时透明区域铺白底。

任务 `status=succeeded` 表示模型结果已保存；`job.delivery.status` 单独记录 `processing`、`succeeded` 或 `failed`。失败时历史显示「已生成 · 交付待处理」，可调整规格并点「重试本地交付」，只读取原图，不再调用 Provider。重启中断交付后，也保持原图和可重试状态。重试后的交付可作为画板新版本，原版本保留。

`originalImagePaths` / `originalOutputMetadata` 记录原图；`outputImagePaths` / `outputMetadata` 记录交付结果，交付失败时回退为可查看的原图。请同时核对交付状态，不能仅凭生成成功认定精确尺寸达标。

## 模型配置

OpenAI 兼容的 Images API 默认只声明 PNG、JPEG、WebP，不再根据模型名称推断 SVG/GIF 能力。使用扩展格式时，先在高级设置勾选格式，并为 SVG 填写作者模型，再在连接检查区选择对应格式，点击「验证所选格式（可能收费）」。确认后提交一次真实生成，检查实际 SVG 内容或 GIF 多帧结构，通过后保存配置即可正常生成。

设置 → AI 模型 → 图片连接 → 高级设置中，可按当前模型覆盖支持的输出格式及 SVG 作者模型。应以实际 Provider 权限为准；模型名称和本地配置不代表上游能力已验证。Codex 账号、Responses 及其他尚未接入此扩展协议的服务仍只提供原有 PNG 路径。

Codex 账号默认使用自动原生尺寸和质量。对于同类 ChatGPT OAuth 中转，可在高级设置启用「上游自动决定尺寸与质量」，或通过 CLI 配置 `--image-control-mode automatic`；精确格式和像素在本地交付中设置。其他原生 Images API 可继续使用原有参数与已确认的能力覆盖。

## 格式参数

- SVG：显式发送 `output_format=svg` 和 `svg.model`；仅支持无参考图的新作品生成。
- GIF：显式发送 `output_format=gif`、`frame_count`、`frame_duration_ms`；固定 512×512。默认 9 帧、每帧 200 毫秒，可选 4–16 帧、20–10000 毫秒且为 10 的倍数。可以传入已有的位图参考图，经 `/images/edits` 生成动画。
- 透明背景：只用于 PNG/WebP；选择 JPEG、SVG、GIF 时会关闭透明背景。
- SVG 不能直接作为模型参考图。SVG/GIF 当前不进入像素编辑器；预览、画板持久化和原文件下载保留各自格式。

SVG/GIF 请求仍须通过格式与动画专项验收，不会把错误结果冒充 SVG/GIF 成功交付；可识别的实际输出会保留为原图并标记交付待处理。SVG 按静态元素/属性白名单重新编码，清除脚本、事件、HTML、外链、样式表、SMIL 和内嵌位图，并限制尺寸、字节量和复杂度；不支持的效果会被移除。GIF 检查帧结构及展开像素预算，原始动画字节不转成 PNG。SVG/GIF 暂不接受本地位图交付参数，避免静默丢失矢量或动画。

## AI 工具与 CLI

`list_providers` 返回当前模型能力，`list_models` 返回各已保存模型的格式能力。`generate_image`、`edit_image` 接受 `outputFormat`、`frameCount`、`frameDurationMs`；SVG 编辑不受支持。

生成工具另接受 `delivery: { format, size, fit, quality }`；`retry_image_delivery` 接受 `jobId` 与可选的新 `delivery`，只做本地处理。CLI 的 `--out` 在交付失败时不会导出一张规格不符的文件充当结果，仍会返回原图路径和非零退出码。

```sh
iterlay image generate --prompt '3:5 竖幅旅行摄影' --size auto \
  --delivery-format jpeg --delivery-size 1200x2000 --fit contain
iterlay image deliver --job <tasks-get返回的job.id> \
  --delivery-format jpeg --delivery-size 1200x2000 --fit cover --out ./delivery.jpg
```

```sh
iterlay image generate --model gpt-image-2.6-flare --prompt '蓝色圆点循环移动' \
  --output-format gif --size 512x512 --frames 9 --frame-duration-ms 200
```

## 验证

本地模拟上游覆盖 JSON SVG 作者参数、GIF 参考图 multipart 参数、实际格式识别、安全处理、任务历史、原文件预览和下载。独立网页开发目录已完成 SVG/GIF 生成、刷新恢复、390px 设置面板检查；截图间像素位置变化确认 GIF 在画板播放，下载文件与工作区保存文件逐字节一致。

这些验证不代表真实上游或生产账号的 SVG/GIF 权限已确认；本次未调用付费生成服务，未发布桌面安装包。

## 格式验证证据

只读连接检查不验证生图格式。真实格式验证按连接地址、接口、模型、SVG 作者及凭据版本绑定，配置变化后旧结果失效。SVG/GIF 未通过当前配置的验证时，会在调用上游前拒绝普通生成。测试原图进入历史，格式不符时保留原图并标记交付失败，不自动重试。

CLI 的 `list_providers` / `list_models` 分别返回声明格式、`verifiedOutputFormats` 与 `outputVerification`。Agent 应将 `passed` 作为已验证的证据，不能只凭 `outputFormats` 宣称可用。验证一次只针对该格式的基础文生图，不代表编辑、参考图或全部尺寸均已验证。

```sh
# 保存声明，不提交生成
iterlay call configure_provider --input '{"kind":"image","providerId":"your-provider","outputFormats":["png","svg"],"svgModel":"your-author-model"}' --json
# 仅在用户明确允许这次真实测试后执行，可能收费
iterlay call verify_image_output --input '{"providerId":"your-provider","outputFormat":"svg","acknowledgeCharges":true}' --json
iterlay models list --provider your-provider --json
```

## SVG 生成方式

SVG 可选择两种显式模式，分别验证，互不自动回退：

- `native`：向图片接口提交 `output_format=svg` 与 `svg.model`，要求上游原生返回 SVG。
- `author`：复用当前 Provider 的连接与凭据，调用配置的 SVG 作者模型生成 SVG 源码，经白名单处理与矢量内容检查后保存。此模式调用作者模型，不使用图片模型；历史与验证结果的 `execution` 记录真实作者。

作者模式适合 Logo、图标、字标和几何插画；不支持参考图、编辑、内嵌位图或外部脚本。不会把 PNG 改扩展名或套入 SVG 冒充矢量，也不在调用失败后自动追加另一种模型请求。

```sh
iterlay call configure_provider --input '{"kind":"image","providerId":"your-provider","outputFormats":["png","svg"],"svgModel":"your-author-model","svgMode":"author"}' --json
iterlay call verify_image_output --input '{"providerId":"your-provider","outputFormat":"svg","acknowledgeCharges":true}' --json
iterlay image generate --provider your-provider --output-format svg --prompt 'A simple vector coffee cup icon' --out ./cup.svg
```

切换原生/作者模式会使旧验证失效，需重新验证所选路径。
