# Iterlay 开源官网

官网首页提供基于当前产品代码设计的交互工作台与预制案例，保留真实下载页面。不包含购买、客户中心、邀请奖励、后台和商业 API。

```bash
cd website
npm ci
npm run dev
npm test
npm run build
```

默认部署到 https://davied-h.github.io/iterlay/ 。使用 HashRouter，下载页为 `/#/download`，GitHub Pages 不需要服务器路由回退。

## 中英文关键路径

`/#/agents` 默认英文；`?lang=zh` 为中文。所有页面的导航、品牌返回、下载与帮助链接均保留当前 `lang`，页脚可切换语言，功能深链接的 `feature` / `sub` 同时保留。英文路径为 `/#/?lang=en`、`/#/wiki?lang=en`、`/#/download?lang=en` 与 `/#/help?lang=en`。英文产品页展示真实 FIELD 成品及十类功能目录；十类功能、全部子操作、图解和下载的加载/错误/缺包状态均提供英文。

帮助页提供中英模型配置、CLI 准备、任务恢复、保存边界及修复版本核对。官网预制体验不保存桌面画板；桌面 App 本地保存与仓库的隔离网页开发工作区分别说明。保存失败或等待中不视为保存成功。

版本标签、日期、安装包与原始发布说明仍来自真实 GitHub Releases。说明保留发布时语言，并明确标注；其中实际出现的 `#123` 与 GitHub URL 会转成链接，原始文本不改写。每条下载始终对应同条 Release，不能根据 issue 已关闭推断修复已进入安装包。开发文档锚点分别指向实际中英文 README 章节。

下载列表从公开 GitHub Releases API 获取，支持 Apple 芯片 DMG、Intel DMG、Windows x64 EXE。安装包直接链接到 GitHub Release 附件；没有附件、网络失败或 API 限流时提供明确状态及 Releases 备用入口。稳定版作为主要下载，测试版出现在历史记录。

发布安装包时，DMG 名称需包含 `arm64` 或 `x64`；Windows x64 使用 `.exe`，如 `Iterlay Setup 0.1.56.exe`。推荐在 GitHub Release 中同时写更新说明。站点没有凭据，也不上传安装包。

`.github/workflows/pages.yml` 使用 GitHub Actions 部署。需将仓库 Settings → Pages → Source 设为 GitHub Actions。工作流自动使用 Pages base path，也可通过 `PAGES_BASE_PATH` 设置本地构建前缀。

桌面客户端永久免费，无需激活，使用自有模型 Provider。下载与更新由 GitHub Releases 提供。

## 默认浏览，点击后体验

首页默认只渲染成果图与案例，不挂载 `InteractiveWorkbench`，不注册画板滚轮或拖动事件。用户可正常滚动与触摸下滑。点击「开始体验」或某个案例按钮才进入单独的沉浸式体验屏幕；「返回案例」和 Escape 可退出，恢复原浏览位置与触发按钮的键盘焦点。比较或历史已打开时，Escape 先关闭局部浮层。

官网改用本轮全新生成的产品原图和成品，不再使用旧香水/台灯图。目前接入柚子气泡饮发布海报、银色跑鞋沙丘广告两组，透明掌机的首张广告因透明残缺被隔离，待补生成确认。定义与资源映射统一在 `src/demo-cases.ts`，素材来源见 `public/gallery/PROVENANCE.md`。不将示例当作客户案例，不暗示本次运行了真实生成。

## 真实操作与预制结果

`InteractiveWorkbench` 以当前 TopBar、ImageNodeToolbar、ImageNodeVersions、CanvasZoomToolbar 和 PromptFusionDock 为依据。体验依次为选图 → 通过工具栏编辑 → 提交预制生成 → 查看版本与对比；按步骤展示单张图、编辑面板或版本控制，避免堆叠。步骤条属于官网引导，不是对 App 向导功能的承诺。

体验页不再提供场景下拉框。换案例回到成果列表，重新开始只重置当前案例。退出时卸载工作台并取消模拟计时器。状态仅在页面内存中，不挂载 IPC、开发桥接或 Provider，不请求模型，也不触碰正式 App 数据。输入允许改写，但明确提示结果固定为预制素材。

图片的 PNG/JPG 导出扩展名与资源格式一致，尺寸由案例元数据给出。下载页仍通过真实 GitHub Releases 获取版本、处理缺失平台与失败重试。外层视觉来源记录见 `design-references.md`，当前规则见 `DESIGN.md`。

## 新素材生成与校验

本轮通过用户授权的 Iterlay CLI / GPT Relay（gpt-image-2.5-flare）生成；原图独立创作，效果图只引用对应的新原图。规划、完整提示词、任务回执、验收状态分别记录在 design/image-direction-v2.md、design/image-prompts-v2.json、design/image-generation-v2.json。原始 PNG 在 output/imagegen/iterlay-website-v2/；网页使用 public/gallery/v2/ 的 1024×1024 WebP。全部验收资源已内嵌提示词，v2/manifest.json 也保存来源，不裁切原画面。

模型本次返回 1254×1254 原图，三组 App 节点与版本元数据相符；网页成品完整缩放到 1024×1024。生成素材与官网体验运行分离：官网仍不调用模型，浏览/进入/退出/编辑/对比按既有流程工作。未通过的掌机结果不会展示给访客。

## 下载页

下载页按用户提供的钉钉截图还原白底大标题、装饰、浅灰圆角双栏与平台列表。仅列 Iterlay 真实安装包平台；二维码指向 https://davied-h.github.io/iterlay/#/download，含义是从其他设备打开下载页，并非移动客户端。架构检测仅在浏览器提供可确认信息时显示当前设备。保留 GitHub Releases 加载/失败重试/缺包/稳定版/测试版及平台历史切换。

## 首页场景与功能 Wiki

首页轮播包含品牌海报、产品广告、AI 助手、模板复用和素材整理，约每 6.5 秒同步切换文案和画面。支持手动切换与暂停，悬停或聚焦展示区暂缓切换；手动选择后暂停。原图/结果场景进入现有预制体验，其余功能场景进入对应 Wiki 页面。首页移除「无需登录，先用预制案例试一试」这句提示。

功能 Wiki 路由为 `/#/wiki`。默认约每 7 秒巡览十类核心功能；目录选择、搜索和展开子功能会暂停，点击「自动巡览」可继续。页面失去可见性暂停计时；减少动态效果下默认不自动播放。手机目录横向滚动，当前功能会定位到可见范围，不带动页面滚动。

目录支持 AI 助手、图片生成与编辑、模板、素材库、画板与版本、视频创作、切图导出、模型设置、Coding Agent 和插件。子项包含操作步骤与能力边界。数据在 `src/features.ts`，各类 source 指向核对过的当前产品代码或使用文档。图解由 `FeaturePreview` 渲染并明确标注「功能示意」，不是实时 App 截图，不调用模型。新增子功能需要同步更新这个数据源，不在页面中复制独立文案。

链接支持 `/#/wiki?feature=templates&sub=create`，可直达模板智能/普通创建说明。自动巡览不持续改写 URL；用户选择才更新可分享地址。官网导航和首页底部均提供 Wiki 入口。


## Wiki 当前视觉

Wiki 经市场参考重做为白底功能目录：顶部横向索引，中部单个大幅功能展示，下方展开子功能。新结构替换旧三栏，不影响功能数据、搜索、深链接和自动巡览。参考来源与实地观察见 design-references.md；实际截图参考墙在 output/playwright/wiki-market-references/index.html。所有图解明确标记为功能示意。


Wiki 当前版本完整采用 Figma Resource Library 式的黑白平面内容语言。WikiFeatureVisual 与首页 FeaturePreview 分离，避免一套视觉在页面里反复嵌套。功能库使用左图右文、矩形展示、横向索引与下方说明；十种图解一并统一，不只覆盖外部样式。
