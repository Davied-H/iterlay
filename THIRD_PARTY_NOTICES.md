# 第三方依赖与资源

根目录 MIT 许可证适用于本项目贡献者拥有版权的原创代码，不替代第三方组件的许可证，也不授予 Iterlay 商标权。

JavaScript 依赖见 `package.json`、`pnpm-lock.yaml` 和 `cli/package-lock.json`。分发前应保留所用版本要求的版权及许可证声明。

FFmpeg / FFprobe 由 `scripts/prepare-ffmpeg.mjs` 从 ffmpeg-static 的发布资源准备，未纳入源码仓库。分发二进制前需按实际构建的 LGPL/GPL 许可条件提供相应声明与源代码等材料。源码的 MIT 许可不覆盖这些二进制。

演示图片、图标及其他视觉资源需依据各自来源和授权使用；不要将源码许可证理解为对来源未核实资源的重新授权。

## 本次二进制分发

安装包包含从 FFmpeg 6.0 官方源码构建的独立 FFmpeg/FFprobe 工具，启用 GPL 和 libx264，不启用 nonfree。完整声明与 GPL-2.0 文本见随包 licenses/。FFmpeg 源码和 x264 r3222 源码作为 GitHub Release 附件提供，构建步骤见 scripts/build-ffmpeg.sh，两者均从源码构建并以 macOS 14 为最低目标。这些工具不适用本项目 MIT 许可证。
