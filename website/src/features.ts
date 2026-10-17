import type { LucideIcon } from 'lucide-react'
import { Bot, ImagePlus, LayoutTemplate, Library, Layers3, Film, Scissors, SlidersHorizontal, TerminalSquare, Puzzle } from 'lucide-react'
export interface SubFeature { id: string; name: string; description: string; steps: string[] }
export interface Feature { id: string; name: string; icon: LucideIcon; headline: string; summary: string; preview: 'assistant' | 'images' | 'templates' | 'assets' | 'canvas' | 'video' | 'export' | 'models' | 'agent' | 'plugins'; boundary: string; source: string; children: SubFeature[] }
export const features: Feature[] = [
  { id:'assistant',name:'AI 助手',icon:Bot,headline:'从一句想法，走到清楚的创作方向。',summary:'围绕当前图片继续对话，把想改的部分、想保留的细节讲清楚，再继续创作。',preview:'assistant',boundary:'需要配置对话模型；图片生成与编辑还取决于所选图片模型的能力。',source:'src/components/assistant/AiAssistant.tsx',children:[
    {id:'context',name:'带着图片对话',description:'将当前图片带入创作上下文，围绕现有内容继续讨论。',steps:['在画板上选中图片。','打开创作助手，将图片作为上下文。','说明希望改变或保留的部分。']},
    {id:'prompt',name:'整理编辑描述',description:'用自然语言逐步明确主体、背景、光线和风格，减少提示词里的歧义。',steps:['描述你的创作目标。','根据助手回应补充约束。','确认描述后再执行生成或编辑。']},
    {id:'conversation',name:'继续创作对话',description:'在同一轮上下文里继续修改方向，查看并复用对话记录。',steps:['在助手面板继续追问。','选择适合的方向。','从已有结果接着编辑。']},
  ]},
  {id:'images',name:'图片生成与编辑',icon:ImagePlus,headline:'给现有图片，换一个新的可能。',summary:'从文字或参考图开始，保留主体、改变背景，或把产品图做成一张发布海报。',preview:'images',boundary:'参考图、编辑和参数支持随服务商与模型变化；实际调用由服务商计费。',source:'src/components/canvas/image-node/ImageNodeToolbar.tsx',children:[
    {id:'generate',name:'文字生成图片',description:'输入画面描述，选择图片模型，在画板中接收生成结果。',steps:['配置支持生图的服务商。','输入主体、构图与风格描述。','提交任务，等待图片落到画板。']},
    {id:'reference',name:'参考图引导',description:'将现有素材加入参考，帮助模型理解主体或视觉方向。',steps:['导入或选中参考素材。','点击图片工具栏中的参考操作。','结合文字描述提交生成。']},
    {id:'remove-background',name:'移除图片背景',description:'在支持该操作的图片菜单中移除背景，输出后需检查透明边缘。',steps:['选中已有图片。','打开更多操作并选择移除背景。','检查主体边缘和透明结果。']},
    {id:'details',name:'图片详情与提示词',description:'查看图片信息和创作描述，了解已有结果的来源。',steps:['选中已有结果。','进入图片详情。','查看描述与信息后继续复用。']},
    {id:'edit',name:'选图继续编辑',description:'以当前图片为起点描述变化，生成新版本而保留原始内容。',steps:['点击画板图片并选择编辑。','确认编辑目标与描述。','执行后查看新增版本。']},
  ]},
  {id:'templates',name:'模板',icon:LayoutTemplate,headline:'把满意的表达，变成能复用的方法。',summary:'保存提示词与规则，通过模板开始下一次创作；也可以从参考中提取可编辑的规则。',preview:'templates',boundary:'智能创建与提取需要相应模型配置，结果仍需复核；模板不是固定成图。',source:'src/components/workbench/SceneLibrary.tsx',children:[
    {id:'use',name:'浏览与使用模板',description:'在模板库查看模板说明与示例，填写需要的内容后继续创作。',steps:['打开模板库选择模板。','查看示例与提示词字段。','填入本次任务内容后执行。']},
    {id:'create',name:'普通创建与智能创建',description:'手动维护模板字段，或描述目标、提供参考让助手辅助创建。',steps:['在模板库点击创建模板。','选择普通创建或智能创建。','检查模板内容与示例后保存。']},
    {id:'extract',name:'从图片提取规则',description:'识别参考图中的视觉与内容规则，复核后整理为模板。',steps:['选择参考图并进入模板提取。','查看解析出的规则。','修改规则并保存模板。']},
    {id:'transfer',name:'导入与导出模板',description:'导入已有模板文件，或导出自己的模板，保留可复用的创作方式。',steps:['在模板库选择导入。','检查导入结果。','需要迁移时导出模板文件。']},
  ]},
  {id:'assets',name:'素材库',icon:Library,headline:'好素材，不必每次重新翻找。',summary:'生成、上传、切图得到的图片与视频汇集在素材库，通过关键词、来源和收藏找到需要的内容。',preview:'assets',boundary:'素材保存在本机；远程模型使用参考时会将所需内容发送给服务商。',source:'src/components/workbench/AssetLibrary.tsx',children:[
    {id:'collect',name:'汇集图片与视频',description:'统一查看本地工作区内生成或导入的媒体素材。',steps:['生成或导入素材。','打开素材库。','选择图片或视频查看。']},
    {id:'search',name:'搜索与筛选',description:'按提示词、标签、画板搜索，结合媒体类型与来源筛选。',steps:['在素材库输入关键词。','选择图片、视频或来源筛选。','定位目标素材。']},
    {id:'favorites',name:'收藏与复用',description:'把常用素材收藏起来，在下一次创作中快速找到并复用。',steps:['收藏需要保留的素材。','切换收藏筛选。','将素材用于当前画板或创作参考。']},
  ]},
  {id:'canvas',name:'画板与版本',icon:Layers3,headline:'参考、尝试与结果，都在同一个空间。',summary:'在无边画板中安排素材，回到任意尝试，比较版本，再决定下一步。',preview:'canvas',boundary:'画板与素材保存在本地；请导出需要迁移或备份的内容。',source:'src/components/canvas/image-node/ImageNodeVersions.tsx',children:[
    {id:'arrange',name:'无边画板与素材整理',description:'平移、缩放、拖动图片，将参考与结果安排在一起。',steps:['新建或打开画板。','导入参考与结果。','拖动、平移和缩放以整理内容。']},
    {id:'versions',name:'版本切换与对比',description:'同一节点保留编辑版本，切回原图并比较变化。',steps:['对现有图片执行编辑。','通过图片版本按钮切换。','打开对比查看局部变化。']},
    {id:'boards',name:'画板库管理',description:'搜索、重命名、排序和导入画板，为不同任务保留独立空间。',steps:['打开画板库。','按关键词或筛选查找。','打开、重命名或导入画板。']},
    {id:'trash',name:'回收与恢复',description:'通过画板或图片回收入口管理已移除内容，避免把临时整理当作永久丢弃。',steps:['在对应画板或图片回收入口查看内容。','选择需要恢复的项目。','恢复后回到工作区核对。']},
    {id:'history',name:'生成记录',description:'查看生成任务与历史结果，沿着之前的尝试继续。',steps:['打开生成历史。','查看任务描述与图片。','定位结果并继续编辑或复用。']},
  ]},
  {id:'video',name:'视频创作',icon:Film,headline:'让静态画面，继续成为动态概念。',summary:'用文字或现有图片发起视频生成，在工作区中查看任务、管理视频并导出。',preview:'video',boundary:'文生视频、图生视频及参数受所选视频模型限制；调用费用由服务商收取。',source:'src/components/canvas/VideoGenerationNode.tsx',children:[
    {id:'text-video',name:'文字生成视频',description:'为镜头、主体与运动编写描述，使用支持的视频模型生成。',steps:['配置视频服务商。','输入画面与运动描述。','选择模型可用参数并提交。']},
    {id:'image-video',name:'从图片生成视频',description:'以已有图片作为视频参考，探索动态表达。',steps:['选择图片作为参考。','描述希望出现的运动。','使用支持图生视频的模型提交。']},
    {id:'manage-video',name:'视频任务与素材',description:'查看视频生成状态、播放结果，并管理或导出视频。',steps:['查看视频任务状态。','完成后播放结果。','按需要导出本地文件。']},
  ]},
  {id:'export',name:'切图与导出',icon:Scissors,headline:'从一张成图，拿到可以交付的素材。',summary:'自由裁切或宫格切图，把图片转为需要的素材，再保存到本地项目。',preview:'export',boundary:'分享与设计稿还原需相应配置；可用入口与类型、设置有关，导出后仍需检查内容。',source:'src/components/canvas/ImageSliceDialog.tsx',children:[
    {id:'crop',name:'自由裁切',description:'选择画面区域，提取所需的局部素材。',steps:['选中图片打开切图。','选择自由裁切并调整范围。','确认后保留裁切结果。']},
    {id:'grid',name:'宫格切图',description:'按常用宫格或自定行列切分，并选择需要的格子。',steps:['打开宫格切图。','设置行列或常用宫格。','检查各格内容后确认。']},
    {id:'save',name:'图片保存与交付',description:'从图片操作或素材工具中下载需要的结果，交付给设计与开发。',steps:['选择满意版本。','使用图片保存或下载。','检查导出的尺寸、格式与内容。']},
    {id:'share',name:'快速分享图片',description:'从图片菜单发起快速分享，并通过分享管理查看已有分享。',steps:['选中需要分享的图片。','在更多操作中选择快速分享。','按当前分享设置生成或管理入口。']},
    {id:'design',name:'还原为可编辑设计稿',description:'通过图片更多操作进入 MasterGo 还原流程，检查并调整设计结果。',steps:['在图片更多操作中选择还原为可编辑设计稿。','完成相应的连接与还原流程。','检查生成的设计稿再继续编辑。']},
    {id:'sticker',name:'微信表情导出',description:'通过图片操作的专用入口处理微信表情导出。',steps:['在设置中确认相关入口已启用。','在图片更多操作中选择微信表情导出。','检查预览并导出。']},
  ]},
  {id:'models',name:'模型与设置',icon:SlidersHorizontal,headline:'用你选的模型，连接自己的创作方式。',summary:'分别管理图片、视频与对话服务商，使用自己的 API Key 或受支持的账户授权。',preview:'models',boundary:'Iterlay 不提供模型额度充值；具体能力、费用与可用性以服务商为准。',source:'src/components/workbench/settings/AiModelsSettings.tsx',children:[
    {id:'providers',name:'多服务商配置',description:'图片、视频与对话可使用不同的模型和服务商。',steps:['打开设置中的模型配置。','添加服务商与所需凭据。','为能力选择默认模型。']},
    {id:'auth',name:'API Key 与账户授权',description:'按所选服务商支持的方式保存 API Key，或使用 Codex 账户授权。',steps:['选择服务商。','完成对应认证方式。','检查配置后开始使用。']},
    {id:'preferences',name:'工作区偏好',description:'按自己的使用习惯调整界面与操作相关设置。',steps:['打开设置。','选择对应偏好分组。','修改后回到工作区检查效果。']},
  ]},
  {id:'agent',name:'Coding Agent',icon:TerminalSquare,headline:'让编程助手，也能帮你完成视觉工作。',summary:'通过 CLI 与 Skill，让 Codex、Claude Code 等工具调用 App 已配置的模型生成、编辑和导出素材。',preview:'agent',boundary:'当前集成方式为 CLI + Skill；需先安装并配置 Iterlay，不会把官网演示变成真实调用。',source:'cli/README.md',children:[
    {id:'setup',name:'安装 CLI 与 Skill',description:'在设置的 Coding Agent 页面完成 CLI/Skill 安装或修复。',steps:['打开设置 → Coding Agent。','检查 CLI 安装状态。','为使用的编程助手安装 Skill。']},
    {id:'automation',name:'生成与编辑素材',description:'让助手通过 Iterlay CLI 使用已保存的模型配置。',steps:['告诉助手具体的创作任务。','通过 CLI 提交图片或视频操作。','在 App 中检查结果。']},
    {id:'deliver',name:'安排画板与导出',description:'让助手整理素材位置，将结果导出到项目目录。',steps:['指定需要的结果与目标目录。','通过 CLI 安排或导出。','核对文件尺寸与完整性。']},
  ]},
  {id:'plugins',name:'插件扩展',icon:Puzzle,headline:'为专门的创作任务，打开新的工具。',summary:'安装、启用与管理插件，在受控工具面板里扩展工作流，例如短剧制作。',preview:'plugins',boundary:'插件能力随安装包和版本变化；短剧工具需安装并启用对应插件，不是默认可用的通用 Agent SDK。',source:'docs/plugins.md',children:[
    {id:'install',name:'插件安装与管理',description:'导入插件包并按权限启用，查看其工具与设置入口。',steps:['打开插件管理。','导入 .iterlay-plugin 包。','检查权限并启用。']},
    {id:'drama',name:'短剧制作工具',description:'通过对应插件处理角色、分镜与制作计划，媒体生成仍走 App 流程。',steps:['安装并启用短剧插件。','打开对应项目工具。','复核计划后逐步制作。']},
    {id:'develop',name:'插件开发',description:'基于项目 SDK 开发受控工具面板和设置页。',steps:['阅读插件开发说明。','使用 SDK 构建并打包。','在 App 中导入验证权限与行为。']},
  ]},
]
