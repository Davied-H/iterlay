# 第三方依赖与资源

根目录 MIT 许可证适用于本项目贡献者拥有版权的原创代码，不替代第三方组件的许可证，也不授予 Iterlay 商标权。

JavaScript 依赖见 `package.json`、`pnpm-lock.yaml` 和 `cli/package-lock.json`。分发前应保留所用版本要求的版权及许可证声明。

FFmpeg / FFprobe 由 `scripts/prepare-ffmpeg.mjs` 从 ffmpeg-static 的发布资源准备，未纳入源码仓库。分发二进制前需按实际构建的 LGPL/GPL 许可条件提供相应声明与源代码等材料。源码的 MIT 许可不覆盖这些二进制。

演示图片、图标及其他视觉资源需依据各自来源和授权使用；不要将源码许可证理解为对来源未核实资源的重新授权。
