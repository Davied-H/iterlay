# 官网新生成素材

本轮素材于 2026-10-17 经用户明确授权，通过 Iterlay CLI 调用已配置 GPT Relay（gpt-image-2.5-flare）生成。未使用旧官网或 App 示例图作为生图参考。先独立生成透明掌机、银色越野跑鞋、YUZU 气泡饮原图，再将各自新原图作为唯一编辑主体生成广告/海报。

当前已接入通过检查的 YUZU 海报和跑鞋沙丘广告两组。掌机原图已通过；首张掌机广告有透明残缺，已隔离，等待额外补生成确认，不进入官网展示。

网页成品位于 v2/*.webp，统一全帧缩放为 1024×1024，没有裁切；WebP 内嵌完整提示词。v2/manifest.json 保存已验收素材的提示词和模型信息。模型原始 PNG 保存在项目 output/imagegen/iterlay-website-v2/，任务与像素校验记录在 website/design/image-generation-v2.json；完整方案在 website/design/image-prompts-v2.json。

这些是新生成的虚构产品演示，不代表真实客户项目。官网中的编辑体验仍播放预制结果，不发起真实模型请求。
