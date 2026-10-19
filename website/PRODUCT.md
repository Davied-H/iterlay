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

## Coding Agent case and onboarding

`/#/agents` 面向使用 Codex / Claude Code 的开发者，默认英文，`?lang=zh` 切换中文；该页导航、正文和页脚随语言切换。页面用同一真实 FIELD 案例连接成品静态网页、橙色产品原图、绿色修改版本、户外广告、海报和可导入 `.itb` 画板。素材生成记录见 `docs/assets/readme/examples/prompts.json`，虚构产品不冒充商业客户。

首次使用明确为安装并打开 App、配置图片模型、安装对应 Agent Skill、检查准备、主动创作、检查画板与导出文件。可复制的分阶段任务来自 `shared/agent-starter.ts`，与 App 引导共享。网站只提供已有素材与任务文本，不调用模型、启动 App 或自动消费额度。软件采用 MIT 免费开源，远程模型由服务商计费，凭据保留在 App，Prompt 与所需参考图发送给所选服务。按 Agent 安装 Skill 不是权限、额度或工作区隔离。

## Bilingual setup and storage boundaries

2026-10-19 用户批准补齐英文官网闭环与保存边界。`lang=en` 覆盖产品、十类功能及全部子操作、下载、配置和排障；站内导航与功能深链接保留语言。英文产品页使用已有 FIELD 真实素材，保留原中文预制交互体验。公共示例不保存桌面画板，桌面本地数据与隔离开发工作区分别解释；失败和等待保存均不代表成功。发布说明保留原文，真实 issue 引用与同条 Release 安装包可核对，不将 main 上的修改或关闭 issue 冒充已发布修复。
