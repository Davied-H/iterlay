---
name: Iterlay Website
description: 白底黑字、浅绿重点，以当前产品的可操作画板引导下载。
colors:
  paper: "#ffffff"
  ink: "#171a1d"
  muted: "#62686d"
  section: "#f5f6f7"
  highlight: "#e3efd7"
  action-hover: "#353e38"
  canvas: "#f3f4ef"
  border: "#e7e9eb"
  workbench-ink: "#171717"
  workbench-muted: "#656b70"
  workbench-accent: "#0f766e"
  workbench-accent-muted: "#e7f3f1"
  case-active: "#f0f4eb"
  result: "#eef4e8"
  result-ink: "#3e5f43"
  agent-ink: "#202722"
  agent-muted: "#626b61"
  agent-link: "#40553c"
  agent-action-hover: "#3e5341"
  agent-secondary-hover: "#edf1e8"
  agent-divider: "#e1e6dc"
  agent-field-border: "#d9dfd2"
typography:
  display:
    fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "clamp(34px, 3.1vw, 45px)"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-1.5px"
  headline:
    fontSize: "clamp(30px, 3vw, 43px)"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-1px"
  body:
    fontSize: "13px"
    lineHeight: 1.8
  workbench:
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif'
    fontSize: "12px"
  editor:
    fontSize: "13px"
    lineHeight: 1.7
  agent-display:
    fontSize: "clamp(36px, 4.2vw, 60px)"
    fontWeight: 550
    lineHeight: 1.16
    letterSpacing: "-1.7px"
  agent-headline:
    fontSize: "clamp(28px, 3.2vw, 40px)"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "-0.8px"
  agent-intro:
    fontSize: "16px"
    lineHeight: 1.85
  agent-body:
    fontSize: "13px"
    lineHeight: 1.85
  agent-command:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
rounded:
  control: "6px"
  chip: "7px"
  toolbar: "8px"
  image: "9px"
  history: "12px"
  composer: "14px"
  frame: "20px"
  story: "28px"
  pill: "999px"
  agent-media: "8px"
spacing:
  compact: "4px"
  control-gap: "6px"
  group: "12px"
  story-gap: "24px"
  story-padding: "32px"
  agent-column-gap: "80px"
  agent-asset-gap: "22px"
components:
  generate-button:
    backgroundColor: "{colors.workbench-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  download-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "13px 23px"
  composer:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.composer}"
    padding: "10px 13px"
  story:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.story}"
    padding: "32px"
  selected-control:
    backgroundColor: "{colors.workbench-accent-muted}"
    textColor: "{colors.workbench-accent}"
    rounded: "{rounded.control}"
  agent-primary:
    backgroundColor: "{colors.agent-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "12px 21px"
  agent-primary-hover:
    backgroundColor: "{colors.agent-action-hover}"
  agent-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.agent-ink}"
    rounded: "{rounded.pill}"
    padding: "12px 21px"
  agent-secondary-hover:
    backgroundColor: "{colors.agent-secondary-hover}"
---

# Design System: Iterlay Website

## Default browsing

默认首页是成果展示，不是已激活的 App。保留克制的浅灰绿底、炭灰文字、低饱和强调、圆润主按钮；首屏以本轮新生成的 YUZU 气泡饮海报与原图对照吸引用户。文案直接解释「用 AI 改图，换背景、调氛围、做海报」，不再使用「让好想法自由发生」一类抽象句子。

首页采用正常文档流。未点击体验按钮之前，不挂载工作台、不设置画板滚轮监听、不拦截触摸下滑。用户可自然浏览全部案例、产品说明与下载入口。

## Outcomes and cases

主展示之后平铺具体任务与新生成的前后效果。当前已验收并接入 YUZU 气泡饮的独立包装设计→上新海报、银色越野跑鞋→赭红沙丘广告。透明掌机原图通过检查，但其首张海面效果图有透明缺口，必须隔离，不能以未验收的结果填充第三个案例。

用户已授权使用 Iterlay 中的 GPT Relay（gpt-image-2.5-flare）生成六张新图。每组先新设计产品原图，再以该原图为唯一编辑参考；不使用旧香水、台灯或仓库现成图。方案与完整提示词在 design/image-prompts-v2.json，任务回执与验证信息在 design/image-generation-v2.json。

网页资源使用完整画面的 1024×1024 WebP，嵌入提示词，来源同时写入 public/gallery/v2/manifest.json。界面仍低饱和，图像本身有清楚的造型与配色：柚子黄/朱红/开心果绿；银色技术织物/浅黄绿鞋带/赭红沙丘。广告与海报是虚构演示，不冒充真实客户项目。

案例网格按实际已验收数量自适应列数，手机单列。数据、提示词、主体描述与图片尺寸都来自 demo-cases.ts，首屏与下载页不得写死旧场景的标题、alt 或路径。

## Explicit entry and exit

「开始体验」进入香水案例；案例按钮进入对应案例。进入时保存浏览位置与按钮标识，展示一屏沉浸式工作台。此时画板才接管滚轮和平移手势。体验页不显示原生场景选择框；左上明确提供「返回案例」，重置当前案例的控件有可访问名称，桌面显示文字标签。退出卸载工作台，恢复浏览位置和键盘焦点。

Escape 在有对比/历史时先关闭局部状态，否则退出体验。退出和重置清理模拟计时器，防止上一案例的延迟结果进入新页面。下载页维持普通网站导航。

## Three product steps

1. 选图：一张原图是主体。点击后出现与当前 App 结构一致的图片工具栏，点「编辑」进入下一步。
2. 编辑：展示已带入的原图、参考图缩略图、描述与生成按钮。参考可移除，空描述禁用提交，支持 Cmd/Ctrl + Enter。页面明确说明修改描述不会改变预制结果。
3. 版本：预制完成后收起编辑面板，提供原图/新版本切换、滑动对比、历史和图片下载。换案例回到案例列表；完成后的主要转化指向真实桌面版下载。

步骤条属于官网引导，不声称真实 App 存在这套向导。未来步骤不可提前点击，已到达步骤可返回。

## Composition and responsive behavior

默认首屏是两列文字与成果图，宽度上限 1120px，成果图宽度上限 500px。页面不出现伪工具栏或不能操作的下拉框。案例区宽度上限 1200px，原图与结果平行对照；页面末尾以下载收尾。

已进入的体验使用 100svh 画板、顶部品牌/下载、第二行返回案例与当前任务、底部步骤条。桌面单图节点宽 340px，以统一 world scale 和拖动坐标换算适应空间，工具栏反向缩放保持屏幕尺寸。左侧只说明当前步骤；手机将说明和下一步动作放到图片下方。编辑面板获得独立空间，不覆盖主体。

工作台保持真实 App 的系统字体、中性表面、青绿色选框、图片上下文操作与浮动编辑器。编辑器宽度上限 515px、圆角 14px，输入桌面为 13px、手机为 12px。出现动画作用于内层，不覆盖外层的水平居中变换；减少动态偏好下停用动画。

## Accessibility and validation

按钮有明确动词、语义名称、焦点和禁用态，步骤使用 aria-current=step。退出恢复触发按钮焦点；结果由 role=status 宣告。PNG/JPG 导出沿用素材实际扩展名，尺寸不写死为灯具尺寸。

验证至少覆盖 1440、1280、550、390px：默认整页正常滚动、未挂载画板、显式进入、三步操作、比较、导出格式、退出卸载、浏览位置与焦点恢复、三个案例各自的预制结果、Escape、取消未完成任务，以及没有外部模型请求。

## Download reference layout (2026-10-17)

用户提供钉钉下载页截图，要求按其布局还原。下载页采用独立 download.css，白底大标题、蓝色手绘双下划线、标题左右小型品牌装饰、副标题与三行真实版本信息。桌面浅灰双栏比例 1.82:1、间隔 26px、面板圆角 43px；左侧逐行列出 Windows x64、Windows ARM64、macOS Intel、macOS Apple 及源码入口。每行左侧系统图标与说明、右侧下载图标；可准确识别架构时标记当前设备，不根据不完整 UA 猜测 Intel/Apple。

右侧保留截图的二维码与面板层级，但按 Iterlay 的真实支持范围标为「其他设备」，二维码指向正式官网 /#/download，不假装提供不存在的移动端。二维码为本地生成 SVG。版本号、发布日期、各平台安装包来自 GitHub Releases。加载、失败重试、缺少某平台安装包均明确呈现，缺包时链接 Releases。下方保留平台可选的历史版本与发布说明。手机双栏改为单列，不水平溢出。

## Multi-scene entry and feature Wiki (2026-10-17)

用户要求首页不再只表达产品改图一个场景。首屏同步循环五种任务：品牌海报、产品广告、AI 助手、模板复用、素材整理。原图/结果场景使用本轮验收图片，其余用清楚标记的功能示意，不使用旧产品截图。标题、描述、行动和画面同步变化。图像场景进入对应预制体验，功能场景进入对应 Wiki；标注要求删除的那句「无需登录」文案不再显示。

首页轮播为 6.5 秒，底部五个选择入口和暂停/播放按钮始终可见。手动选择暂停，悬停/聚焦暂缓；减少动态偏好下默认暂停。画面与文字用短距离位移和透明度过渡，轮播指示使用 transform，不用 width 动画改变布局。

Wiki 是独立的 `/#/wiki` 页面，以浅灰绿底和白色三栏阅读工作台展示全局功能。桌面左侧目录 205px、右侧说明 280px，中间自适应。目录含搜索与十类核心功能；中间包含巡览控制、当前功能标题、图解和代码依据链接；右侧可展开子功能，显示在 App 中的操作步骤及使用边界。平板将子功能放到中间展示下方，手机单栏，目录横向可滚动。所有网格列使用可收缩轨道，避免仅外层无溢出而内部裁切。

默认每 7 秒巡览全部十类功能；手动浏览、搜索或展开说明后暂停。可从末尾回到第一项。子功能支持参数链接，自动播放不重写浏览器地址。网页不可见时停转，减少动态效果下默认不开启。读者在主要说明区域阅读时暂缓切换。

图解包括对话上下文、图片前后结果、模板架与字段、素材搜索、画板与版本、视频任务静态示意、切图网格、模型配置、CLI 命令、插件流程。非可操作控件使用非交互元素，整体标注功能示意。真实操作与边界来自当前 features.ts 中 source 对应的代码；不虚构视频成片，不自动调用模型，不把插件能力承诺为默认内置。

验证首页自动/暂停/手选、Wiki 自动与末尾循环、目录和全部子项、搜索与空状态、参数直达、手机内外层不裁切、减少动态，以及既有案例的选图/生成/退出。功能 Wiki 采用与产品一致的系统字体；代码命令只在 CLI 示例中用等宽字体。


## Wiki visual replacement (2026-10-17, latest)

本节替代前文 Wiki 的浅灰绿三栏规则。用户明确否定旧视觉，要求市场调研后重构。依据 VK / Figma Resource Library 的白底、明确标题层级与目录，以及 Notion 的大幅产品展示，Wiki 单独采用中性白底与石墨文字。主站和下载页保持既有风格。

页面内容宽 1200px，大标题「功能一览」桌面 66px、手机 47px；右侧搜索采用简单下划线，不做独立卡片。十类核心功能以横向文本索引呈现，选中项仅用深色下划线标记，手机横向滚动。

主体采用两列（.8fr / 1.35fr），间隔 55px：左侧当前功能名称 47px、简短介绍与巡览控制；右侧 510px 高浅灰展示区域承载一个功能示意。去掉虚拟窗口顶栏、外套白卡、绿色描边和多重导航，不把图解伪装成真实 App 截图。舞台背景 #f4f4f5，整体文字以 #1d1d1f / #6d6d72 分级。

子功能在主展示下方阅读，左侧短标题、右侧细分隔线列表，点击展开操作步骤。能力边界和代码来源置于正文末尾。手机改为单列，并在 320px 下核对内部内容无裁切。

保留 7 秒自动巡览、手动暂停、搜索、无结果恢复、十类索引和38项子功能，以及 feature/sub 参数深链接。手动展开后暂停，减少动态时默认停播。动画仅用轻位移与透明度；装饰不承担阅读结构。


## Wiki final visual authority: Figma Resource Library

用户再次要求 UI 风格也完整跟随市场参考，不能只替换外部布局。当前 Wiki 以 Figma Resource Library 为单一视觉来源，本节覆盖之前混合 VK / Notion 的 Wiki 配方。

采用白底、黑色大标题、矩形媒体、严谨网格、短分类标签和细分隔线。标题「功能库」桌面76px、手机53px；索引为纯文本下划线；搜索为轻描边矩形。主展示比例1.45:1，左侧大幅内容、右侧功能名称和描述；手机顺序为媒体→内容。圆角、阴影、漂浮容器、倾斜叠图与聊天气泡不再用于 Wiki。

Wiki 使用独立 WikiFeatureVisual / wiki-feature-visual.css，不再沿用首页 FeaturePreview 的缩小 App 示意。十类图解都采用同一平面编辑语言：完整矩形照片、前后排列、海报阵列、素材接触表、清楚的文字规则、切图网格或真实命令示例。没有虚拟输入框或不能点击的伪工具。图解以「功能示意」标注，不冒充真实截图。

所有正文灰度保持 #666 或更深，黑字为 #171717。插件图解以低饱和淡紫底作为内容色，界面导航仍黑白。自动巡览/搜索/子功能/分享链接的行为保留，不因换风格改变产品事实。

## Agent workflow page (2026-10-18)

以下为 `AgentPage.tsx` 和 `agent-page.css` 已完成实现的范围记录。frontmatter 中 `agent-*` 仅描述 Agent 页，不能替代首页、下载页、Wiki 或 App 设置的既有阶梯。

### Overview

`/#/agents` 延续主站白底、石墨文字、浅灰绿分区与圆润动作按钮。首屏为直接的工作流说明与 FIELD 成品网页真实截图，随后平铺橙色原图、鼠尾草绿修改版、户外图和发布海报。FIELD 为虚构品牌；图片为实际生成素材，来源记录可读，不冒充客户项目。成品网页、可导入画板与完整项目形成同一个案例。

### Colors

主文字和主按钮使用 `agent-ink`，正文为 `agent-muted`；`agent-link` 用于带下划线的文字行动。准备区和末尾行动区复用 `canvas` 浅灰绿背景。细分隔线与白底输入框分别使用 `agent-divider`、`agent-field-border`。按钮 hover 分为加深主色和淡绿次级底色，图片中的橙与绿属于案例素材，不升级为全站 UI 强调色。

### Typography

继承主站 Inter / 系统无衬线字体；只有安装命令使用等宽字体。桌面 hero、区标题、介绍、常规正文和命令分别使用 frontmatter 的 `agent-display`、`agent-headline`、`agent-intro`、`agent-body`、`agent-command`。步骤标题为 (23px / 550)，图片标题为 (19px / 550)，步骤正文为 (14px / 1.85)；说明与状态为 (10–12px)。

宽度不超过 (1000px) 时 hero 标题为 (44px)，介绍为 (14px)；不超过 (760px) 时 hero 为 (40px / 1.2)，区标题为 (28px)，图片标题为 (21px)，正文为 (13px)，任务文本为 (12px)。不超过 (380px) 时 hero 为 (36px)。这些是该页的响应式覆写，不是全站新字号标准。

### Layout

内容上限 (1200px)，桌面左右留白至少 (40px)。hero 两列比例 (.95fr / 1fr)，常规双列等宽，复用 `agent-column-gap`；大于 (1500px) 时仅 hero 间距增至 (110px)。四张方形图片平铺，使用 `agent-asset-gap`，没有多层外卡或虚构工具栏。资料区、画板下载和三步骤用细线分隔。

不超过 (1000px) 时左右留白 (30px)、主要列间距 (40px)；不超过 (760px) 时左右留白 (20px)，hero、图片、步骤和隐私区按自然顺序单列，正常滚动。任务按钮可换行；不超过 (380px) 时复制行转为纵向。窄屏导航按已有 CSS 收起次要项，保留品牌与下载。

### Elevation & Depth

Agent 内容不添加阴影或浮动窗口，依靠白底、浅灰绿分区、图片和细线建立层级；案例图作为内容呈现。

### Shapes

媒体使用 `agent-media` 轻圆角，动作按钮使用既有 `pill`；命令与长任务框圆角 (7px)，复制图标按钮圆角 (5px)，步骤序号为 (29px) 圆形细描边。

### Components

主次按钮最小高度 (46px)，复制任务按钮为 (40px)；文字行动带可辨认的下划线。Agent 与任务选择使用下划线和 `aria-pressed`，互不混合状态。安装命令为只读输入框；长任务为可选择、可纵向调整的只读文本框，桌面高 (290px)、手机高 (315px)，高度范围 (180–620px)。复制失败聚焦并选中文本，提示键盘复制；反馈通过 `role=status` 宣告。滚动到准备区尊重减少动态偏好，按钮 hover 为短背景过渡 (.18s)。

### Do's and Don'ts

- 保留正常文档滚动和三步阅读顺序：准备 Iterlay → 给 Agent 具体任务 → 检查并交付。默认英文，`/#/agents?lang=zh` 为中文；页头、正文、页脚与语言一致，英文下载进入 `/#/download?lang=en`，再选择真实 GitHub Releases 安装包。
- 从 `shared/agent-starter.ts` 生成检查、创作、交付三类任务，与 App「开始使用」共享事实。已有 FIELD 画板可无 Provider 查看和导出；新创作才需要图片模型及费用确认。已保存配置不代表远端服务已实测健康。
- 交付指向实际文件：橙色原图 → `hero.png`、户外图 → `scene.png`、海报 → `campaign.png`，写入 `./public/iterlay-starter/`，保留已有文件与橙→绿版本链；绿色为编辑变体。
- 网站不调用模型或启动 App。CLI 准备检查可为建立连接启动 App；画板与素材保存在本机，Prompt 与所需参考图发送给所选服务，凭据留在 App。安装某 Agent 的 Skill 不产生独立工作区、额度或权限边界。
- `examples/field/field-review.mp4` 是已有 FIELD 画板的真实版本检查与滑块回看实录，不是新生成或外部 Agent 执行录像；本轮没有承诺模型生成视频。

完成证据：`.impeccable/review/agents/` 中的 `desktop.png`、`mobile.png`、`user-320.png`、`field-desktop.png`、`field-mobile.png`，以及 `.impeccable/review/agent-settings-desktop.png`。独立 finish review 为 `ship`，确认本轮表面无需继续修改 UI；运行验证与真实付费生成链路的边界以交付记录为准。

### Bilingual product and help (2026-10-19)

英文产品页沿用 Agent 页的白底、石墨文字、浅灰绿分隔与既有 FIELD 实图。功能目录采用平面文字行和细分隔线，桌面两列、手机一列。`HelpPage` 为正常滚动的阅读页，内容上限 (1000px)，桌面留白 (40px)、手机 (20px)，正文 (15px / 1.9)、手机 (14px)。目录在当前 HashRouter 页面内滚动，不破坏 `lang` 路由。下载页保留既有视觉与真实版本机制，翻译界面和状态，不伪造英文发布说明。手机导航收紧间距，确保英文下载按钮完整可见。
