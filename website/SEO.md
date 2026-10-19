# SEO 与 AI 搜索维护

## 已实现的三个阶段

1. 构建时静态生成 40 个双语页面（每种语言：产品、下载、Wiki、Agent、帮助、指南索引、10 个功能页、4 篇教程）。直接访问每条路径就能读取 HTML 正文，不需要运行 JavaScript。浏览器加载后恢复 React 交互。
2. 功能文章复用 `src/features.ts` / `src/features.en.ts`；四篇双语教程在 `src/content.ts`，包含模型配置、版本对比、Coding Agent、FIELD 案例。来源可核对，不编造客户、评分、发布版本或生成结果。
3. 构建校验、部署后 HTTP 巡检、Search Console/Bing 验证码入口、可选访问与转化统计及人工 AI 引用评估流程。

第三阶段的代码与操作入口已具备；Google/Bing 账号验证、提交 sitemap、Plausible 站点开通和真实收录/引用结果依赖外部账号与发布后的数据，不会因本地构建成功自动完成。

## 路由与部署

默认站点为 `https://davied-h.github.io/iterlay/`。英文产品页为 `/iterlay/en/`，中文为 `/iterlay/zh/`，根页面保留中文 HTML 并 canonical 到中文产品页。`/#/agents` 仍默认英文，`/#/agents?lang=zh` 为中文。旧 Hash 入口、功能与子操作参数会在浏览器中转换，原二维码仍能使用。

页面由 `scripts/prerender.mjs` 在 Vite 构建后输出为对应目录下的 `index.html`。GitHub Pages 直接提供这些文件；不依赖 SPA 回退。`404.html` 使用 noindex，部署主机应对未知地址返回 HTTP 404，不能统一返回 200 的首页。

修改部署地址时同步设置：

```bash
cd website
PAGES_BASE_PATH=/ VITE_SITE_ORIGIN=https://your-domain.example npm run build
```

`VITE_SITE_ORIGIN` 只包含协议和主机，不包含路径；`PAGES_BASE_PATH` 是以 `/` 开头和结尾的部署目录。无需新增服务器或修改 Electron 打包流程。

## 元信息与 AI 可读内容

- 每页独立标题、描述、canonical、en / zh-CN / x-default hreflang、Open Graph 与 Twitter 分享卡。
- JSON-LD 提供 WebSite、WebPage / TechArticle、面包屑，首页描述 SoftwareApplication；无虚构评分、评论或未证实的版本日期。
- `dist/sitemap.xml` 只列正式双语页面，不列根重复入口、查询参数或 404。
- `dist/llms.txt` 为可选机器阅读索引，不是排名、收录或 AI 引用保证。
- 所有功能与教程都包含普通 HTML 链接，指南入口位于全站页脚，Wiki 链接到每个功能页。
- 下载页在无 JS 时提供 GitHub Releases 备用链接；实时版本与附件仍由浏览器请求真实 Release 数据，构建不虚构或冻结安装包。

### robots.txt 的主机根路径限制

构建会输出 `robots.txt`，但爬虫只认主机根目录的 `/robots.txt`。当前 `/iterlay/robots.txt` **不控制** `davied-h.github.io` 整个主机。当前项目无法单独修改用户站点仓库的根文件；发布时需要核对 `https://davied-h.github.io/robots.txt`。

使用独立域名并部署到 `/` 后，生成的文件即可直接生效。默认允许爬取，不设置训练爬虫黑名单，也不因技术抓取许可而授予内容许可证；若要限制特定训练用途，应先选择策略并在主机根 robots 中单独配置。llms.txt 在项目路径可以直接访问，但不保证各工具自动发现它。

## Google Search Console 与 Bing Webmaster Tools

1. Google Search Console 添加 URL 前缀属性 `https://davied-h.github.io/iterlay/`；不要尝试验证不属于你的 `github.io` 域名 DNS。Bing 添加相同站点，也可使用已验证的 Google 属性导入。
2. 选择 HTML meta 验证，取 Google `google-site-verification` 或 Bing `msvalidate.01` 的 **content 值**，不要粘贴整段 HTML。
3. 在 GitHub 仓库 Settings → Secrets and variables → Actions → Variables 设置公开变量：
   - `GOOGLE_SITE_VERIFICATION`
   - `BING_SITE_VERIFICATION`
4. 重新运行 Pages 工作流，在源 HTML 确认 meta 后到平台点验证。
5. 两个平台提交 `https://davied-h.github.io/iterlay/sitemap.xml`，抽查 `/en/`、`/zh/`、`/en/agents/` 与教程页面的 URL 检查和渲染结果。

本地构建对应变量为 `VITE_GOOGLE_SITE_VERIFICATION` / `VITE_BING_SITE_VERIFICATION`。这些是公开站点验证值，不是 API 密钥。仅添加配置不会自动完成账号验证或 sitemap 提交。

## 可选访问与下载转化统计

默认不加载统计脚本、不发送统计事件。要启用，请先在 Plausible 中建立站点，并把其站点域名写入 GitHub Actions 变量 `PLAUSIBLE_DOMAIN`（本地对应 `VITE_PLAUSIBLE_DOMAIN`）。部署后会加载 Plausible 手动统计脚本；需要网络允许访问 `plausible.io`。

记录事件：

- `pageview`：每次站内路径变化，移除查询参数和 hash。
- `DownloadPageClick`：点击站内下载页入口，表示下载意图。
- `InstallerClick`：点击真实 GitHub Release 的 DMG/EXE/ZIP 附件，只表示点击，不等于下载完成或安装完成。
- `ExampleDownload`：点击 FIELD 的 `.itb` 或完整项目 ZIP。

在 Plausible 创建同名自定义事件 Goals 后检查转化。事件属性只包含当前页面路径与去查询参数后的目标地址；代码不会发送提示词、API Key、Agent 任务文本或本地工作区内容。第三方服务仍会接收网络请求，启用前应核对其数据政策及你面向地区的要求。

未提供站点域名时，不能声称已经采集到真实访问、下载量或转化率。

## 验证命令与 CI

```bash
cd website
npm test
npm run typecheck
npm run build
npm run check:seo
npm run preview -- --host 127.0.0.1 --port 4174
# 发布后检查线上；更换域名时设置完整站点 URL：
SEO_SITE_URL=https://davied-h.github.io/iterlay/ npm run check:live
```

`build` 自动检查 40 页的正文、唯一标题、canonical、多语言元信息、JSON-LD、站内链接、静态素材与 404 noindex。新增页面后同步更新校验脚本的预期数量。

Pages 工作流依次执行单测、类型检查、构建校验、部署与线上巡检。线上巡检检查所有 sitemap 地址的 HTTP 状态、正文、canonical、noindex 和未知地址 404，保存 `website-seo-audit` Artifact。报告中的主机 `/robots.txt` 原文需要人工检查具体规则；HTTP 200 本身不代表允许所有爬虫。

## 收录与 AI 引用评估

发布当天记录基线，发布后 7 天与 28 天对照；这是人工检查建议，不是已创建的定时任务。没有读到报表的数据一律记为「未获取」，不要记作 0。

- Google/Bing：提交页数、已收录页数、未收录原因、自然搜索展示与点击、品牌词与非品牌词。
- 访问：自然搜索与 AI 来源访问、产品到下载入口的点击比例、安装包点击数。AI 工具可能不传 referrer，不能据此认定没有 AI 来源。
- AI 搜索：在同一批目标问题中检查是否出现 Iterlay、引用了哪个 URL、是否准确描述产品边界；记录日期、平台、问题原文、模型或模式、回答证据和纠错项。

固定问题建议：

1. 有什么开源的 AI 图片编辑无限画板工具？
2. 如何用 Coding Agent 生成并导出网站素材？
3. Iterlay 免费吗？模型调用是否收费？
4. Iterlay 的图片是否完全离线处理？
5. How can I compare AI image edit versions on a local canvas?
6. How do I use a coding agent to deliver existing image assets without generating again?

结果模板见 `seo-evaluation-template.md`。优先修复引用错误、缺失条件和不可访问页面，再根据真实搜索词扩写内容。避免生成仅替换关键词的重复文章。

## 产品与 Coding Agent 的独立定位

- 产品首页面向视觉创作者，主线为桌面图片生成、编辑、版本比较、无限画板与素材整理；主要行动是下载 App 和了解创作工具。
- `/agents/` 面向开发者，主线为外部 Coding Agent 通过 CLI + Skill 连接 App、自动化创作与交付代码项目文件；主要行动是配置集成。
- 两条入口具有独立标题、描述、分享图、内容主题与受众标记。结构化数据将桌面 App 作为 SoftwareApplication，将 CLI + Skill 作为属于同一产品的 SoftwareSourceCode 集成，不将 Iterlay 描述成独立编程 Agent。
- 指南目录分开列出桌面产品教程与 Coding Agent 教程；相关文章优先链接同一主题。llms.txt 同样分节解释二者关系，避免 AI 将集成功能当作产品的唯一用途。
