# Iterlay 开源官网

从 iterlay-manage 的官网和下载页面迁移，保留产品介绍及界面素材。不包含购买、客户中心、邀请奖励、后台和商业 API。

```bash
cd website
npm ci
npm run dev
npm test
npm run build
```

默认部署到 https://davied-h.github.io/iterlay/ 。使用 HashRouter，下载页为 `/#/download`，GitHub Pages 不需要服务器路由回退。

下载列表从公开 GitHub Releases API 获取，支持 Apple 芯片 DMG、Intel DMG、Windows x64 EXE。安装包直接链接到 GitHub Release 附件；没有附件、网络失败或 API 限流时提供明确状态及 Releases 备用入口。稳定版作为主要下载，测试版出现在历史记录。

发布安装包时，DMG 名称需包含 `arm64` 或 `x64`；Windows x64 使用 `.exe`，如 `Iterlay Setup 0.1.56.exe`。推荐在 GitHub Release 中同时写更新说明。站点没有凭据，也不上传安装包。

`.github/workflows/pages.yml` 使用 GitHub Actions 部署。需将仓库 Settings → Pages → Source 设为 GitHub Actions。工作流自动使用 Pages base path，也可通过 `PAGES_BASE_PATH` 设置本地构建前缀。

网站去除商业入口不会改变桌面客户端现有授权逻辑；当前客户端仍保留官方服务依赖，详情见根目录 README。
