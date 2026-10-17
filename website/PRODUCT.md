# Product
<!-- impeccable:product-schema 1 -->
## Platform
web
## Product Purpose
Iterlay 是开源 AI 创作桌面工作台，在无限画板中完成图片生成、编辑、版本比较和素材整理。
## Capabilities and Constraints
官网使用 React、Vite 和 HashRouter，通过公开 GitHub Releases 获取安装包。保留下载、平台切换、版本记录和失败重试。真实 AI 功能需在桌面版自行配置 Provider。官网体验为本地预置素材模拟，不调用付费生成接口。
## Brand Commitments
保留 Iterlay 名称、标识与开源属性。用户明确要求官网简单大气、低饱和、层级克制、流畅动效；2026-10-17 最新约定：默认展示成果和具体案例，允许正常滚动；用户点击按钮后才进入沉浸式交互画板，退出返回案例原位置。2026-10-16 用户指定 https://www.dingtalk.com/ 为官网外层视觉参考，授权调研后自动完成一轮优化；当前 App 的交互结构与预制体验边界继续优先保留。
## Evidence on Hand
以 src/components/workbench/TopBar.tsx、PromptFusionDock.tsx、src/components/canvas/image-node/ 和 src/styles/00-foundation.css 中的当前真实产品代码为视觉与交互依据；2026-10-17 用户要求不再使用已有香水/台灯素材，已授权全新生成产品原图和案例效果；网页仅接入通过检查的新素材，记录在 website/design/image-generation-v2.json。旧官网截图过时，不再用作依据。无客户证言或业绩数据，不编造商业证明。

## Feature discovery

2026-10-17 用户要求首页多场景自动轮播及集成核心功能的 Wiki。官网通过 `/#/wiki` 的十类目录与子功能说明解释实际产品，默认自动巡览并支持暂停、搜索、参数直达。功能依据集中在 website/src/features.ts；界面图解为明确标注的非实时示意，不能据此承诺截图级一致或执行模型任务。
