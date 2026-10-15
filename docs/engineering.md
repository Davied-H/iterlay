# 工程结构与验证说明

本轮实施日期：2026-10-15；审查基准为 `eaacf4b`。以下记录对应工程审查的 17 个方向，描述实际落地范围、兼容边界与验证方法。工作区同时包含网页调试入口、按需下载媒体工具等独立改动，实施时保留了它们。

## 模块边界

- `src/features/boards/`：画板保存、冲突重基、历史查询、窗口保存协议及画板库窗口化。
- `src/features/generation/`：前端生成控制器，负责占位节点、任务状态和当前画板隔离。
- `src/features/settings/`、`src/features/assistant/`：设置状态与动作、助手会话状态及资源清理。
- `electron/application/`：图片生成、MCP 命令、素材目录及工作台应用入口。
- `electron/domain/board-model.ts`：纯画板规范化、合并、布局与命令规划。
- `electron/storage/`：持久化、写入队列、缓存、版本检查和日志恢复。
- `shared/contracts/`：按领域拆分的传输类型；`shared/workbench-client.ts` 提供类型化调用映射。
- `shared/provider-capabilities.ts`：UI 与执行端共享的图片 Provider 能力。
- `electron/agents/`：两组 Pi SDK 的适配边界，保留当前版本和行为。

桌面 IPC、已鉴权的本地网页桥和 MCP 复用注册的应用处理入口。渲染进程调用需要通过 sender/frame/入口 URL 检查；主进程内部 adapter 使用独立注册表，不能因为隐藏窗口为 `about:blank` 而阻断已鉴权的服务调用。

## 17 项实施对应

1. **自动保存与退出协议**：`BoardSaveCoordinator` 合并保存、防抖、失败保持 dirty；`use-board-persistence` 提供可见失败提示及重试。窗口关闭、应用退出与网页后台重启先确认保存，失败保留编辑环境。
2. **设置原子持久化**：设置使用临时文件、文件同步和原子替换；IPC 使用可等待的 transaction，一起提交设置与密钥，失败回滚内存。schemaVersion 1，损坏配置报错并保留原文件。
3. **恢复工程门槛**：修正嵌套构建目录、环境 globals、未使用声明和 Hook 依赖；新增 PR 类型、lint、测试与构建检查，以及 macOS 独立网页 smoke。可见桌面 smoke 仅接受手动 workflow 的明确输入。
4. **拆分核心控制层**：提取生成、设置、保存、历史和助手会话模块，设置页的通用 Provider 组件独立。App 仍承担工作台组合及部分视频、漫剧交互；后续按新增功能继续下放，不以文件行数作为唯一拆分目标。
5. **MCP 窗口生命周期**：使用动态窗口 resolver，首窗销毁后重新打开窗口可重新定位；不再把整个桥固定在启动窗口。
6. **MCP 与 IPC 共用服务**：移除 MCP 的运行时 JavaScript 拼接和 `executeJavaScript`；生成在主进程执行，任务元数据落盘、缓存受限。stdio 使用不依赖 Electron 的纯 Node 客户端。增加请求体限制、deadline 和幂等参数一致性检查。
7. **领域 IPC 与契约**：抽出图片生成服务、视频 IPC 和素材目录；`shared/types.ts` 保留兼容 re-export，实际类型分到领域 contracts。公共调用使用共享命令映射，关键生成/保存入口增加运行时校验。
8. **旧商业能力兼容**：历史账单与付费 receipt helper 放到 `src/compat/`；社区 Provider 的新图片生成流程不依赖官方余额或报价。旧数据和必要旧契约继续可读，没有删除所有历史字段。
9. **画板领域与版本语义**：规范化及布局规划抽为纯函数，普通快照保存增加 expectedRevision。冲突使用三方重基，保留远程新增、各方删除和独立字段编辑；同一次生成的服务端节点与前端占位节点去重，包括两种端口标识对应的输出连线。父子画板创建及同步改名增加可重放事务日志。
10. **存储与素材规模**：图片尺寸查询移出全局写锁，路径去重、有限并发并保留 native fallback；详情 LRU 为 32，摘要索引独立。素材目录合并并发重建、30 秒缓存、只装饰请求页。历史改为增量日志，rail 每页 100；画廊按需读取当前画板完整历史，模板库按需查询 scene 历史。
11. **主线程负载**：PSD 的颜色转换和编码进入 Worker，使用 transferable、超时与取消；主进程逐层解码并限制像素内存总预算为 256 MB。日志批量异步写入、限队列并支持 flush/轮转。native 解码仍留在需要它的进程和受限队列。
12. **国际化**：去除全局 DOM MutationObserver 翻译，改为 React 渲染时 `useUiText()`；英文词典按需加载。用户提示词、画板名等动态内容在翻译后插入，避免被当作 UI 文案翻译。
13. **可复现测试**：生成与 MCP 核心回归直接测试控制器/应用服务；保留必要静态结构约束，并用 helper 兼容翻译调用。smoke 使用独立 userData、本地假 Provider 和固定素材，不依赖真实 Key 或个人授权文件。
14. **Provider 与 SDK 边界**：集中图片数量、尺寸、透明背景与参考图能力；图片 adapter 使用 registry。两组 Pi SDK 通过 coding/tool runtime 隔离，未在缺乏迁移证据时强制合并版本。
15. **桌面信任边界**：开启 sandbox；preload 打包 CJS；主页面 CSP、外链协议白名单、导航限制和统一 IPC 来源校验。开发 nonce 仅用于 Vite serve，生产脚本策略不随开发放宽。
16. **画板库与体积预算**：画板库按视口窗口化，从实际 CSS grid 测量列数；千画板真实浏览器验证滚动和搜索。CanvasBoard 静态依赖预算继续为 547 kB gzip，没有通过抬高预算使构建通过；当前约 544.1 kB / 52 个文件。
17. **子项目及实验边界**：新增 `setup:subprojects`、`typecheck`、`check:all`、`bench:storage`，CLI 发布前增加类型检查，官网有独立 tsconfig。48 个根级实验文件移入 `src/dev/previews/`，预览 query ID 保持兼容；样式按原顺序拆为 10 个领域文件。

## 持久化格式与恢复

### 画板

画板继续使用 schemaVersion 3 的 JSON。expectedRevision 不匹配时返回包含 `BOARD_REVISION_CONFLICT` 的错误，渲染层获取最新快照并重基；失败不应标记为已保存。返回给调用者的快照与缓存隔离，防止调用者直接污染缓存。

`boards/.transaction.json` 是父子画板创建/同步改名的短期意图日志，格式为 `{ schemaVersion: 1, boards: [childSnapshot, parentSnapshot] }`。先持久化意图，再依次原子替换两个画板文件，全部完成后删除日志。进程中断或部分写入失败后，下一次 Store 访问先重放完整意图，再接受其他操作；日志无效则报错并保留。恢复是 roll-forward，不能把失败返回理解为“所有写入都已撤销”。当前不提供通用跨文件数据库事务，也不把其他独立操作宣称为全事务化。

### 历史记录

- `history.json` 保留旧版可读取的数组 checkpoint。
- `history-journal.jsonl` 每行一个 `{ version: 1, upsert?: GenerationJob[], remove?: string[] }` 提交，追加完成并同步文件后更新内存。
- 启动时加载 checkpoint，再按行重放 journal；只截断末尾未完成的一行，完整行损坏时明确报错。
- 每 200 个增量提交压缩 checkpoint；正常退出前 `flush()` 写入最新 checkpoint。复制或恢复运行中的工作区时，必须同时保留这两个文件。
- 崩溃后直接用旧版本打开，旧版本不会重放新增 journal；需要降级时先用当前版本正常退出，确保 checkpoint 已更新。

### 设置与样式兼容

异步 IPC 走 settings transaction；现存同步 setter 仍使用原子兼容 writer。持久化完成表示写入链路已完成，不等于已经验证所有文件系统/突然断电条件。

CSS 拆分前后逐文件拼接 SHA-256 均为：

```text
28e418c3e8a4737e05d9bcba2a252180517eeb95465c95d127499107fdeb27e5
```

拆分保留本轮开始前已有的样式修改、内容和层叠顺序；`src/styles.css` 现在只是 import 入口。

## 本地检查

```bash
pnpm install
pnpm setup:subprojects
pnpm check:all
```

`check:all` 覆盖 renderer、Electron、CLI、官网的类型检查、根 lint/测试、官网测试以及四个构建；不发布，不执行可见 App 功能测试。官网和 CLI 继续由各自 npm lockfile 管理。日常网页验证遵守仓库 `AGENTS.md`，使用独立开发数据；不要将正式 App 数据目录传给测试。

存储微基准需要先编译 Electron：

```bash
pnpm build:electron
ITERLAY_BENCHMARK_BASE_REF=eaacf4b pnpm bench:storage
```

可通过 `ITERLAY_BENCHMARK_BUILD_DIR` 指向独立编译目录。脚本使用临时 fixture 工作区并自动清理，结果写入 `output/engineering/storage-benchmark.json`。基准替换的只是 BoardStore，使用相同 runtime、原子 writer 与 metadata reader，隔离存储实现的差异。

## 本轮验证结果

- 根类型检查与 lint 通过；renderer、Electron/preload、CLI、官网构建通过，官网 3 个测试通过。
- 根测试 285 个文件通过、1 个文件跳过；1838 条通过、4 条跳过。包含保存失败/重试、三方重基、切板隔离、设置原子写入、历史日志恢复、缓存淘汰、元数据并发、IPC 来源和 Worker 输出等回归。
- 独立网页：250 条历史按 100 → 200 → 250 加载；1001 个 fixture 画板首屏渲染 28 张卡片，底部仍少于 100 张，末项可达、搜索正确；英文设置下用户画板名“画板库”保持原文。
- 真实生成按钮经确认后调用本地假 Provider 一次；最终保存一个输出图片、一条输出连线，renderer 无异常。另有网页 smoke 覆盖导入、重载、HTTP Range、事件与单编辑会话。
- 实际编译后的 PSD Worker 通过像素与位置 round-trip，验证 BGRA → RGBA 和 ArrayBuffer 转移；预取消由单元测试覆盖。
- 前端生产 JavaScript 不含网页开发通信入口，打包配置排除开发桥接模块。

这些网页检查使用随机端口和独立临时数据，不连接用户运行中的默认 5180 工作区。未执行真实收费 Provider 调用、Windows 原生验证、签名公证或安装包发布；本机测量环境为 macOS ARM64 / Node 26.10.0，CI 配置 Node 22，但本轮未取得远程 CI 运行结果。

## 存储基准及限制

20 个样本，nearest-rank median / p95；新建 Store 对象但不清空 OS 文件缓存，所有节点共享一张 JPEG。以下单位为毫秒，前者是基线，后者是当前实现。

- 100 节点首次读取：median 0.20 → 0.26；p95 0.29 → 0.36。
- 1000 节点首次读取：median 0.94 → 1.30；p95 1.07 → 1.45。
- 5000 节点首次读取：median 4.60 → 5.67；p95 5.24 → 6.38。
- 100 画板重复摘要查询：median 1.16 → 0.11；p95 1.57 → 0.13。
- 1000 画板重复摘要查询：median 11.31 → 0.63；p95 11.63 → 0.73。

摘要查询收益明确；在这些已有正确尺寸的轻量 fixture 上，新 Store 首次读取仍因缓存隔离、恢复检查等增加开销。实现已去掉首次解析后的重复克隆，但不能声称冷打开全面加速。测量未覆盖独立大图解码、真实素材库、画布 FPS、拖拽延迟、峰值内存或完整应用首次可交互时间；这些需要各自 profiler/基准，不能由本微基准推导。
