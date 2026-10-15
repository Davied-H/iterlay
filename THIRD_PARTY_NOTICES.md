# 第三方依赖与资源

根目录 MIT 许可证适用于本项目贡献者拥有版权的原创代码，不替代第三方组件的许可证，也不授予 Iterlay 商标权。

JavaScript 依赖见 `package.json`、`pnpm-lock.yaml` 和 `cli/package-lock.json`。分发前应保留所用版本要求的版权及许可证声明。

FFmpeg / FFprobe 作为独立视频工具组件按需下载，不包含在应用安装包内。`scripts/prepare-ffmpeg.mjs` 调用 `scripts/build-ffmpeg.sh`，从校验过 SHA-256 的固定源码构建，禁止使用 nonfree 预编译替代物。源码仓库的 MIT 许可不覆盖这些工具。

演示图片、图标及其他视觉资源需依据各自来源和授权使用；不要将源码许可证理解为对来源未核实资源的重新授权。

## 视频工具组件分发

`ffmpeg6-r1` 组件包含 FFmpeg 6.0 和 x264 commit `b35605ace3ddf7c1a5d67a2eb553f034aef41d55`，启用 GPL 和 libx264，不启用 nonfree，最低系统版本为 macOS 14，架构为 ARM64。组件以 `iterlay-media-tools-ffmpeg6-r1-darwin-arm64.zip` 发布至 GitHub Release `media-tools-ffmpeg6-r1`；应用内清单固定其下载 URL、长度及 SHA-256。

组件的 `licenses/` 目录包含 GPL-2.0 文本、FFmpeg 许可证说明和 README、x264 COPYING、与二进制精确对应的两个原始源码压缩包、构建脚本，以及记录编译器、完整 FFmpeg 配置、源地址和源码哈希的 `build-info.json`。这些材料随二进制同一归档分发并原样安装到用户数据目录，便于获取相应源代码和重建。分发者仍需遵循各组件许可条件；这些工具不适用本项目 MIT 许可证。
