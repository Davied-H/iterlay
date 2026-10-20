# 工具插件（API v1，实验版）

Iterlay 的工具插件是一个独立安装包，可以注册画板侧栏入口，提供完整的 React 工具界面和设置页。短剧助手是第一个官方工具，界面从安装包加载，不再编译进主程序。1.2.0 起，短剧插件占据整个项目工作区，默认页面是分镜网格，不再挂载节点画板。主程序保留短剧领域数据兼容、版本校验和可信 Agent 执行能力，插件通过 SDK 调用。1.3.2 起，角色画面策略、项目初始化和兼容助手的创作规划在已安装的插件沙箱中运行，不再从宿主静态导入插件业务源码。

## 使用

在画板左上方的插件工具栏点击 `＋` 打开插件市场。可安装随应用发布的官方工具，也可导入 `.iterlay-plugin` 文件。安装前展示开发者、版本和权限。支持停用、启用、卸载及同 ID 更新。

第一版的“市场”是随应用发布的官方目录，并非已上线的第三方在线服务。第三方发布审核、远程下载、签名验证、自动更新，以及 Provider 插件运行机制尚未实现。

安装短剧助手后，点击侧栏入口即可新建短剧项目；已有短剧入口和旧画板继续可用。插件未安装时，短剧画板保留内容并显示安装入口。

## 插件包

`.iterlay-plugin` 是 ZIP，包含且只包含两个文件：

- `manifest.json`：ID、名称、版本、API 版本、权限和设置页声明。
- `index.html`：自包含的界面文件，JavaScript、CSS、字体和静态图片都应内联；运行时不允许直接访问网络。

单包及解压后的总大小上限均为 8MB。ID 只允许小写字母、数字、点和连字符。版本为 `x.y.z`，`apiVersion` 必须为 `1`。参考 [官方插件声明](../plugins/short-drama/manifest.json)。

## React 开发

源码示例位于 `plugins/short-drama/src/`，SDK 位于 `packages/plugin-sdk/src/`。在本仓库可以直接引用 SDK 源码；`@iterlay/plugin-sdk` 目前尚未发布到 npm。`pnpm plugins:build` 同时构建独立 SDK（含类型声明），第三方项目可用 `npm install /绝对路径/packages/plugin-sdk` 本地安装，然后从 `@iterlay/plugin-sdk` 导入；SDK 构建产物不依赖仓库外部源码。

```tsx
import { iterlay, usePluginContext } from "../../../packages/plugin-sdk/src";

export function MyTool() {
  const context = usePluginContext();
  return <button onClick={async () => {
    const snapshot = await iterlay.board.snapshot();
    console.log(context?.boardId, snapshot.nodes);
  }}>读取当前画板</button>;
}
```

`pnpm plugins:build` 使用 esbuild 打包官方 React 插件，输出 `resources/plugins/dev.iterlay.short-drama.iterlay-plugin`。开发启动和前端构建会自动运行它。修改插件源码后需重建，再在插件管理器导入新包；已经安装的包不会被源码修改悄悄替换。发行包把官方插件放在 Electron resources 的 `plugins/` 目录。

第三方可复用 `scripts/build-plugins.mjs` 的打包方式：React 打包为浏览器 IIFE，内联 CSS，写入 HTML，再将 HTML 与声明打成 ZIP。插件不得依赖 Iterlay 内部组件、React 实例或私有模块。

## 宿主 API

所有方法都通过消息桥调用，宿主按插件 ID 校验已安装、已启用和已授权权限。第三方代码不获得 Electron preload、Node.js、模型密钥或父页面 DOM。

- `workspace.back()` / `workspace.manage()`：通过宿主保存并返回主工作区、打开插件管理。
- `context.get()` / `usePluginContext()`：当前画板 ID、选中节点 ID、主题、语言。
- `board.previews()`：读取当前画板中与角色/分镜关联的真实图片缩略图，仅返回受控的小尺寸 data URL；缺少素材时返回空项。
- `board.snapshot()`：读取当前画板的短剧领域节点、连接、分组和 revision（初版接口，不包含所有普通素材节点）。
- `board.applyPlan(plan)`：在当前画板应用受校验的节点添加/短剧节点更新计划，必须携带最新 revision。保留宿主撤销记录，不允许跨画板写入。
- `board.select(ids)`：在当前画板选择节点。
- `storage.get(scope)` / `storage.set(scope, value)`：`settings` 为插件全局配置；`board` 为插件在当前画板的项目数据。每份数据上限 1MB，原子写入并串行提交。
- `assistant.start(instruction, conversation, conversationId, { currentFields })`：插件自行构造创作上下文，启动绑定当前画板的短剧 Agent；宿主校验上下文大小并固定画板、权限和助手 surface，流式事件通过 `onEvent` 返回。
- `assistant.cancel()` / `assistant.respond(id, action, values)`：取消及响应原生 Agent 的确认/表单。
- `onEvent(listener)`：监听 `context`、`view`、`board-changed` 和 `assistant`。返回取消监听函数。

`view` 为 `tool` 或 `settings`，同一 React 包自行渲染对应界面。当前只有固定工具面板和设置页两个扩展位置。助手权限目前专用于短剧，不是通用的第三方 Agent/Provider SDK。

## 安装包升级与旧入口兼容

已有安装不会因源码构建而被静默覆盖。已安装 1.3.1 或更早版本仍可打开原工作台并使用导演；只有旧协议未提供 `currentFields` 时，宿主动态加载专用兼容适配器补齐原有节点上下文。新版本自行提供上下文。

角色卡的“生成形象 / 逐项重试”、新建项目及兼容创作助手的业务规划需要 1.3.2 能力。旧包在调用前立即提示更新，不会空等超时或删除任何画板、素材、版本及插件草稿；角色卡提示提供“插件市场”入口。到插件市场点击短剧助手的“更新”，确认原权限后重试。停用或卸载后同样保留数据，并提示安装或启用。

SDK 的 `registerCapability(name, handler)` 可以注册纯业务能力。宿主仅接受明确列出的能力，在已安装插件的独立隐藏沙箱内调用；该模式不挂载工作台、没有宿主 API 监听器，也不访问模型凭证。请求绑定来源窗口和随机 ID，返回前再次验证安装/启用权限；切换画板或卸载组件会取消角色请求并释放沙箱。角色版本变化后旧请求不能继续确认或提交。

角色能力仅返回提示词、尺寸和生成用途，宿主过滤结果，不接受插件提供的 Provider、报价或跨画板参数。节点规划必须绑定输入画板 ID 和 revision，保存时还需通过主进程领域验证。费用确认、模型调用、保存、撤销和资源安全校验仍由宿主执行。本轮不是通用第三方 Provider 插件框架。

## 执行边界与数据

插件 HTML 由仅绑定 `127.0.0.1` 的文档服务提供，使用随机令牌 URL，在 `sandbox="allow-scripts allow-forms"` 的不透明来源 iframe 中运行。允许 React 接收表单事件，但文档 CSP 的 form-action 禁止表单导航；同时禁止网络、嵌套框架和外部脚本。主应用继续使用严格的脚本 CSP，仅额外允许框架加载本机文档服务。不能用 srcdoc：它会继承主应用 CSP，阻止插件内联 React 脚本。

宿主仅接受当前 iframe Window 发出的请求，逐次授权并限制可调用的方法。关闭插件会取消关联助手请求。模型生成与费用确认继续走原有应用流程，不把任意 IPC 或凭证暴露给插件。

插件安装在 `<userData>/plugins/installed/`；独立配置和画板数据在 `<userData>/plugins/data/<plugin-id>/`，存储 scope 使用哈希文件名。停用、卸载和重新安装都不删除画板、素材及插件数据。当前插件状态模型为 schema v1，同 ID 升级需维持已有数据兼容；通用迁移 Hook 尚未提供。

## 短剧助手重构

工作区按“故事 → 角色 → 分镜 → 制作”组织。可以手动编辑设定、角色外观锚点、动作、台词、镜头运动与时长；保存会创建新版本。AI 导演结合当前阶段、选中节点和最新 revision 工作，媒体调用仍需确认。对话、输入草稿、未完成编辑和当前阶段按画板持久化，导演习惯独立存储。

参考调研（2026-10-16）：

- [ai_story](https://github.com/xhongc/ai_story)：参考公开 README、导演模式截图和分镜界面的阶段组织、单镜编辑与重试方式。该项目声明 CC BY-NC-SA 4.0，本实现未复制其代码或视觉资产。
- [BigBanana AI Director](https://github.com/shuyu-labs/BigBanana-AI-Director)：公开文档强调 Script → Asset → Keyframe 与角色、场景一致性。仅作为产品机制参考，未验证其在线功能。
- [LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama)：公开文档展示列表编辑与画布编排双视图、剧内助手。仅作为产品机制参考，未验证其在线功能。

## 验证

```bash
pnpm exec vitest run test/plugin-store.test.ts test/short-drama-plugin.test.ts
ITERLAY_BROWSER_DEV_USER_DATA="$PWD/tmp/plugin-dev/user-data" ITERLAY_BROWSER_DEV_PORT=5193 pnpm dev
# 在另一终端，连接上面的同一个隔离开发服务
ITERLAY_BROWSER_SMOKE_URL=http://127.0.0.1:5193 pnpm test:browser:plugins
```

浏览器验证使用隔离开发数据，创建示例短剧并保留以供检查。覆盖官方安装、实际 React 界面、版本化编辑、草稿恢复、设置、画板选择同步、iframe 隔离、未配置模型时的错误恢复、离线模型驱动的真实 Agent 表单/版本化写入/结束/取消、停用、卸载、本地导入及重装数据保留。截图写入 `output/playwright/`。不调用付费媒体服务，不代表真实模型出图/成片质量已验收。

短剧助手 1.1.0 的界面方向由用户选择：以 Boords 编辑器为主、Katalist 角色列表为辅；制作和 AI 导演使用独立视图。详细规范见 `plugins/short-drama/DESIGN.md`。

短剧助手 1.2.0 根据用户进一步要求改为完整 Boords 式工作台：主区域分镜网格/清单、故事文档和角色资产，右侧按需展示编辑器/AI/设置。生成角色形象、首帧及视频从插件内发起，沿用现有报价确认流程。

短剧助手 1.3.0 按 Boords 公开编辑器截图重做可见 UI：四列 contact sheet、图标工具栏/密度滑杆、默认剧本侧栏和黄色保存按钮。新增 `workspace.export()` 复用宿主导出，剧本面板按 revision 保存多个镜头新版本，演示模式可切换镜头。
