# 画板 Canvas 代码组件

在普通画板左侧工具栏点击「添加 Canvas」，或双击画板空白处，在创建菜单选择 Canvas。

- HTML：完整文档或 HTML 片段，可包含 CSS、JavaScript。
- React：JavaScript / JSX，默认导出组件或声明 `App`。内置 `react`、`react-dom/client`。
- Vue：单文件组件，支持 `<script setup>`、`<template>`、`<style>`；也接受默认导出的 Vue 组件。内置 `vue`。

代码自动保存到画板，刷新后恢复；运行状态不保存，也不会在打开画板时自动执行。点击「预览」自动运行最新代码；代码未变且已运行时保留交互状态。也可点击「运行」或按 Command/Ctrl + Enter 重新运行，「停止」销毁 iframe。修改代码不会即时刷新正在运行的预览。切换框架时仅替换未修改的示例，自定义代码会保留。组件可拖动、复制、删除并使用画板撤销。

## 代码编辑

编辑区提供 HTML、React JSX、Vue 语法高亮、行号、折叠、括号匹配、自动缩进与编辑撤销。打开编辑区及失焦时自动格式化；未完成或有语法错误的代码保留原文。也可以点击浮动栏的「格式化代码」，或按 Command/Ctrl + Shift + F 手动格式化。

## 沙盒边界

预览为独立静态文档，使用 `sandbox="allow-scripts"`，不授予同源、弹窗、表单提交、下载或顶层导航权限。没有 Electron preload / IPC，也没有宿主 API 消息桥。CSP 禁止 fetch/WebSocket、嵌套 frame、object、表单提交；允许 HTTP(S) 图片，供作品展示图片。预览不能读取宿主 DOM、Cookie 或 LocalStorage。不提供 Node.js、终端、文件系统、npm 包安装或任意远程模块加载。

React、Vue、Babel 和 Vue 编译器在构建时打包到独立 `code-sandbox/runtime.js`，无需 CDN，只有点击运行才加载。依赖许可证随 `code-sandbox/LICENSES.txt` 分发。该隔离适用于界面代码预览，不提供独立进程的 CPU/内存资源配额；不应执行恶意死循环。

## AI 助手

助手通过 `create_canvas` 创建，通过 `get_board` 读取现有代码，通过 `update_canvas` 修改。更新须携带读取时的 `expectedCode`，不匹配会拒绝覆盖；画板写入串行化，并沿用画板更新事件刷新页面。创建和修改工具只保存代码，用户点击运行才执行。

完整旧默认工具列表自动升级并加入两个 Canvas 工具；用户主动缩减过的工具列表保持原样，需要在助手工具设置中勾选。专用漫剧助手和只读画廊回顾不增加 Canvas 写入权限。

## 验证

`pnpm exec vitest run test/code-canvas.test.ts` 验证持久化、参数边界、并发冲突和助手画板作用域。网页模式使用独立开发目录，通过 Playwright 验证 HTML、React、Vue 交互、停止、错误展示、保存恢复及宿主隔离。不要为此启动可见桌面 App。

## Console 与设备预览

浮动工具栏中的 Console 可查看 `console.log/info/warn/error/debug`、运行错误和表达式结果，支持筛选、清空及在当前沙盒中执行表达式。日志最多保留 200 条，并限制每秒输出量，避免日志刷屏。

设备尺寸可选桌面 1280×800、平板 768×1024、手机 390×844，也可输入 240–3840 范围内的自定义宽高或旋转横竖屏。尺寸保存到 Canvas 节点；预览画面会缩放适配节点，iframe 内实际 viewport 使用所选尺寸。
