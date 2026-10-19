# 产品改进记录：2026-10-19

这份记录对应本轮确认的九项改进，说明当前代码里的操作入口、实际行为、验证证据与边界。改动尚未发布为新的 GitHub Release、安装包或线上官网版本；本地构建通过也不等于用户已安装的版本包含这些功能。

本轮没有调用真实收费 Provider，没有把正式 App 的模型密钥复制到测试环境，也没有启动可见桌面 App 做功能测试。生成、取消与 Agent 回填采用离线 Provider 响应和隔离文件目录验证。网页开发模式连接本地后台业务 API，与官网公开示例、已安装 App 的正式工作区分别判断。

## 1. 模型配置：明确“检查完成”验证了什么

**入口**：设置 → 模型服务 → 编辑图片、文本或视频服务 → 连接检查。图片服务另有“生成测试图（可能收费）”。

- 默认“检查连接（不生成）”只访问只读接口，不向图片生成或文本生成接口发送测试任务。
- 结果分别显示联网、鉴权、模型目录、实际能力和主动生成的状态：已确认、未通过、未确认、未测试。
- HTTP 400、404 或服务有响应，不能自动显示凭据与模型可用；HTML 登录页、异常 JSON 和无法识别的模型目录也不会成为通过证据。
- 模型出现在目录中，只表示目录包含这个模型，不证明它支持参考图、编辑或工具调用。
- OAuth 本地凭据可读取时，明确显示仅确认本地凭据，网络、服务端鉴权及模型能力仍未验证。
- 图片主动测试必须确认可能收费后才提交一次文生图请求。返回图片后展示预览，不自动加入画板；即使成功，也只说明文生图得到验证。
- 主动测试失败或超时不会自动重试，结果保留“可能已产生费用”的说明。

**验证**：`test/provider-diagnostics.test.ts`、`test/ai-model-settings-ui.test.ts` 覆盖只读探测、常见错误码、无效返回、收费确认、单次提交与预览边界。

**限制**：本轮未实测任何真实服务商的网络、凭据或模型能力。部分服务没有可靠的只读鉴权接口，显示“未确认”是预期结果；文本与视频服务本轮没有增加主动付费能力测试。

## 2. 历史复用：提示词与完整任务分开

**入口**：画板顶部“历史” → 展开一条图片任务 → “复用提示词”或“还原任务”。

- “复用提示词”只替换文字及结构化提示词，保留当前模型、参考图与编辑目标。
- “还原任务”读取原 Provider、模型、参数、编辑源图和参考图，先构成草稿，再由用户提交；不会自动调用模型。
- 新记录保存输入快照，包括参考图名称、角色、语义职责和源节点信息。编辑任务固定已提交的受管源图副本，不随画布当前激活版本变化。
- 编辑历史始终保留 `edit`，不会因为用户已退出编辑而变成 `generate`。原节点不存在时仍使用保存的源图进行编辑，结果作为独立图片放到当前画板。
- 任一参考图不可读、原 Provider 已删除或旧编辑缺少可确定的源图时，拒绝部分还原，不静默换图或换 Provider。
- 旧记录缺失名称或职责时保留原始顺序，并明确提示核对；无法确定的输入不会假装已精确恢复。
- 读取期间如果画板或输入草稿已经改变，不覆盖新内容。
- 原任务的报价、收费尝试与幂等身份不随历史还原重放。

**验证**：`test/generation-history.test.ts`、`test/generation-history-controller.test.ts` 验证固定源图、参考职责、失效阻断、原模型提交和不重放收费身份；`test/board-archive.test.ts` 覆盖归档关联数据。

**限制**：旧历史没有保存过的语义信息无法补造。还原任务后重新提交属于新的模型请求，可能产生费用；不能用还原任务替代对 `unknown` 状态的核实。

## 3. 局部编辑：让 Agent 接手持久修改请求

**入口**：图片 → 编辑 → 高级编辑或 Relax Flow → “保存给 Agent”；画板顶部“修改请求”查看与补充。

- 高级编辑保存当前源版本、区域蒙版、编辑要求与参考图；Relax Flow 保存相对原图的区域、文字、标注截图和约束说明。
- 请求固定 `boardId`、`nodeId`、`sourcePath` 与 `sourceVersionId`，后来切换到 V2 不会把原本针对 V1 的意见挪到 V2。
- 保存与复制接手说明均不调用模型。缺少修改文字时进入 `needs-input`，补充明确要求后才变成 `ready`。
- 同一请求一次只允许一个 Agent 领取。领取返回 `claim.token`；普通列表、详情和准备执行结果不再暴露这个接手凭证。
- 执行前再次核对源节点与版本。源图失效时阻断，不换成当前图继续花费。
- 同一领取绑定一个持久执行键；多次准备、重启后准备以及两个 CLI operation ID 的相同执行，都沿用该键，由后端合并同一付费生成。
- 完成时只接受同画板、同请求、同执行键、同源图的真实成功编辑任务与受管输出，随后把版本追加回原节点。重复完成不会再次追加。
- 完成事件使用请求中真实的画板 ID，刷新当前画板，避免后续自动保存拿旧快照覆盖 Agent 回填结果。

### Agent 的精确 CLI 流程

以下是命令模板，尖括号内容须替换为上一条命令的真实返回值。`--json` 的返回数据在 `data` 内；不会自动执行这些示例。开发验证应给每条命令传同一个隔离开发数据目录，或设置 `ITERLAY_USER_DATA_PATH`，不能默认连接正式数据。

先读取请求，核对固定版本、要求和约束；需要时通过 `read_asset` 读取 `annotationPath`、`maskPath` 等受管图片供 Agent 检查：

```sh
iterlay call list_modification_requests --input '{"boardId":"<board-id>"}' --json
iterlay call get_modification_request --input '{"requestId":"<request-id>"}' --json
iterlay call read_asset --input '{"path":"<annotationPath-or-maskPath>"}' --json
```

如果状态是 `needs-input`，先向用户确认缺失要求，再保存真实答复。不要自行推断用户尚未说明的修改目标：

```sh
iterlay call clarify_modification_request --input '{"requestId":"<request-id>","instruction":"<用户确认的明确要求>"}' --json
```

领取后保存返回的 `data.claim.token`。这个值作为后续的 `claimToken`，不同于请求编号，也不是普通详情里能重新读取的字段：

```sh
iterlay call claim_modification_request --input '{"requestId":"<request-id>","owner":"<agent-session-id>"}' --json
```

在用户已授权的生成范围内执行编辑。`boardId` 和 `sourcePath` 必须来自原请求；`prompt` 应反映修改文字、区域、标注与保留约束，不能只复制一条含糊要求。`edit_image` 会内部准备执行键并带入请求保存的蒙版及参考图；`annotationPath` 是给 Agent 理解标注的证据，不能假设模型会自动理解所有画笔意图：

```sh
iterlay call edit_image --input '{"boardId":"<request.boardId>","sourcePath":"<request.sourcePath>","prompt":"<核对后的完整修改指令>","providerId":"<已配置的图片Provider-id>","modificationRequestId":"<request-id>","claimToken":"<claim.token>","requestId":"<stable-operation-id>"}' --json
iterlay tasks wait <generationId> --json
```

上一步 `edit_image` 返回的 `generationId` 是 CLI 操作编号；`tasks wait` 成功结果中的 `data.job.id` 才是 `resultJobId`。把返回的真实图片路径用于 `resultPaths`：

```sh
iterlay call finish_modification_request --input '{"requestId":"<request-id>","claimToken":"<claim.token>","resultJobId":"<succeeded-task.job.id>","resultPaths":["<succeeded-task.images[0].path>"]}' --json
```

生成已成功但完成请求失败时，重试关联已有结果，不要重新生成。确定失败时可使用同一凭证记录错误；远端状态不明时先查询任务与服务商，不能因为停止等待就认定失败或重新开一条收费任务：

```sh
iterlay tasks get <generationId> --json
iterlay call finish_modification_request --input '{"requestId":"<request-id>","claimToken":"<claim.token>","error":"<已确认的失败原因>"}' --json
```

**验证**：`test/modification-requests.test.ts`、`test/modification-requests-dialog.test.ts`、`test/workspace-modification-commands.test.ts` 覆盖持久化、竞争领取、凭证不可泄露、源版本固定、执行键合并、重复回填、错误画板 ID 及延迟响应不串板。

**限制**：本轮没有自动替用户启动 Agent，也没有真实付费编辑。请求是本机工作区记录，未新增跨机器请求同步或 `.itb` 请求迁移。源图、蒙版和参考图合计最多四张；超出时执行明确拒绝，不丢弃某张后继续生成。高级编辑使用蒙版固定区域；只有 Relax Flow 标注会额外提供结构化相对区域。

## 4. 任务控制：取消排队与停止等待分开

**入口**：历史面板的“本机在途任务”中，对尚未提交的任务使用“取消排队”；CLI 使用 `iterlay tasks cancel <generationId>`。

- UI 本地队列和共享后端生成服务保留三任务并发限制；Agent 与 UI 都经过共享后端限制。
- 取消尚未提交的排队任务，会移除占位与在途状态，并确保不调用 Provider。已进入后端持久队列的记录转为 `cancelled`。
- 已提交到 Provider 的任务不能借本机取消宣称远端停止。接口返回 `running` 与 `remoteCancelled: false`，继续接收真实晚到结果。
- CLI 的 Ctrl+C 只结束当前等待，任务仍可用 `tasks get` / `tasks wait` 查询。
- 传输中断、超时或进程重启后无法确定的远端结果标为 `unknown`，显示费用状态待确认，不误报成功或确定失败。
- 启动恢复时，持久记录中未提交的 `queued` 任务转为 `cancelled`，已提交的 `running` 转为 `unknown`；已有官方远端任务恢复路径保留。

**验证**：`test/generation-queue.test.ts`、`test/generation-queue-controller.test.ts`、`test/provider-semaphore.test.ts`、`test/image-generation-service.test.ts`、`test/history-store.test.ts`、`test/workspace-image-commands.test.ts` 覆盖第四个任务取消、并发槽释放、晚到成功结果与中断恢复。

**限制**：没有实现服务商专有的远端撤销与退费 API；视频远端取消不在该命令范围。前端本地队列里尚未发给后端的任务没有持久生成历史，取消后不会伪造一条已提交任务记录。

## 5. 版本管理：最终稿独立于当前预览

**入口**：画板顶部“项目交付” → “选定最终稿”；图片节点上展示最终稿版本标记。

- 使用源路径与任务 ID 共同固定最终稿；选定 V2 后继续生成 V3、切换预览或重新打开，最终稿仍是 V2。
- 最终稿选择立即保存；“未选定最终稿”可清除标记，不删除图片。
- 移动拆分或抽取版本时，最终稿标记跟随实际包含该版本的节点；已有交付配方引用的版本不允许直接移动分离，提示使用复制分离或先调整配方。
- 最终稿源版本已不可用时明确显示失效，不暗中改用当前版本。
- 最终稿、配方固定源以及历史快照参与存储引用保护；画板归档导入会重映射图片路径、节点与任务身份。

**验证**：`test/image-delivery.test.ts`、`test/image-versions.test.ts`、`test/board-archive.test.ts` 验证跨预览、追加、重新读取、拆分转移、源失效和归档映射。

**限制**：最终稿标记不会自动改写已经保存的交付配方。配方固定了哪个版本，就继续使用那个版本；需要主动调整配方才能换稿。

## 6. 导出：固定源版本的项目交付配方

**入口**：画板顶部“项目交付” → 新建或选择配方 → 添加交付文件 → “保存配方”或“保存并导出 ZIP”。

- 每个条目保存源节点、固定源版本、用途、相对项目路径、PNG/JPEG/WebP、宽高和适用的质量参数。
- 新条目优先使用该节点已选定的最终稿；保存后的条目不会跟随预览或后续最终稿变化。
- 仅填宽或高时保持比例；同时填宽高时按指定尺寸缩放。JPEG 透明区明确铺白底。
- 实际转换输出字节，再检查真实 MIME 与尺寸，避免“完成了却把 PNG 保存成 .bin”或只改扩展名。
- ZIP 内保留相对目录并带 `manifest.json`，记录用途、源节点与源任务、源图/结果的 SHA-256、真实 MIME、尺寸和字节数。
- 路径穿越、系统保留名、大小写重复、文件/目录冲突、格式与扩展名不符都会阻断；目标 ZIP 使用排他创建，不覆盖已有交付包。
- 配方有未保存修改时，切换或关闭需确认；任何源绑定失效时整体拒绝导出，不悄悄交付半份内容。

**验证**：`test/image-delivery.test.ts`、`test/image-delivery-ui.test.ts` 覆盖固定 V2、草稿保留、非法路径、真实 ZIP/PNG/manifest、格式及尺寸伪造拒绝、源失效与不覆盖。

**限制**：交付输出为用户选定位置的 ZIP，不直接写入或覆盖现有项目目录。每份配方 1–100 个文件，单张最多 3200 万像素，总编码结果最多 400 MB。编码通过真实运行时 API 接线，但本轮没有可见桌面 App 上逐一实测所有编解码格式。

## 7. UI 与试用：参数摘要和可定位的 FIELD 章节

**入口**：画板输入区的参数按钮；导入 FIELD 画板后的左上“FIELD 实例”；设置中的 Coding Agent 首次交付任务。

- 输入区直接展示模型、尺寸、适用质量和张数，点击摘要打开现有完整参数面板。
- 仅在适配器真实转发质量参数时显示质量选择；其他服务显示“服务商默认质量”，不制造无效控件。
- 编辑使用 fal 时摘要采用实际参考图模型。长模型名可截断，完整值保留在提示与可访问名称中。
- 模式命名改为“对话规划 / 直接生成”，动作显示“生成 N 张 / 应用修改”，减少“AI / 普通”的歧义。
- FIELD 导入后提供源图、改色、场景、海报、导出五个章节，定位真实图片及版本，沿用现有结果，不重新生成。
- 章节依赖真实历史与版本关系；改画板名或归档重新分配 ID 后仍能定位。普通画板仅仅叫 FIELD 不会自动显示；源内容移除后对应章节禁用。
- 导出章节打开包含 `assets/hero.png`、`assets/scene.png`、`assets/campaign.png` 的配方草稿，仍需用户检查、保存和导出，不自动写文件。
- 没有引入与画布平移冲突的 Space 参数快捷键。

**验证**：`test/generation-settings-summary.test.ts`、`test/field-chapters.test.ts`、`test/image-delivery-ui.test.ts`、`test/agent-starter.test.ts` 验证模型与参数含义、真实内容识别、失效章节和未保存配方草稿。

**限制**：本批调整操作组织与输入信息，没有全面替换工作台视觉、导航体系或高级编辑器。FIELD 章节服务已有示例内容，未新增任意用户画板的通用章节编辑器。

## 8. 保存可靠性：明确官网、桌面与网页开发的边界

**入口**：官网“配置与帮助” → “保存位置与边界”，中英文均有说明。

- 官网公开示例使用预制素材与模拟交互，不创建桌面画板，不调用模型，刷新可能重置；保留已有内容需要下载图片、`.itb` 或示例项目包。
- 桌面工作区保存在本机，不等同于网站账号或云备份。关闭、重启或清理数据前需等待保存成功，失败不能当作已保存。
- 本地 `pnpm dev` 网页模式连接独立本地后台，并使用隔离开发数据；后台断开时保留页面、重连并确认保存后再离开。
- 新增配方与最终稿沿用持久化画板服务；修改请求独立原子保存，重启后可读取。没有把浏览器临时状态当作正式保存成功证据。

**验证**：本轮存储与归档单元测试覆盖新增数据的重新读取与映射；本轮没有修改自动保存协调器、后台退出或重连协议，既有保存保护规则继续沿用。

**限制**：这里没有声称新增了云备份、恢复被用户永久删除的源版本，或完成所有系统上的断电测试。网页开发验证不等于桌面安装包验证，二者也都不等于官网预制示例的运行方式。

## 9. 官网与运营：英文路径与可下载修复闭环

**入口**：英文 Agent 页的 Product、Features、Get the app 和 Setup & help；下载页的版本历史。

- 英文导航、页脚和站内链接统一保留 `lang=en`。Product 进入英文首页，Features 进入英文功能 Wiki，下载与帮助页继续保持英文。
- 实际 HashRouter 路由为 `#/?lang=en`、`#/wiki?lang=en`、`#/agents?lang=en`、`#/download?lang=en`、`#/help?lang=en`；中文对应 `lang=zh`。
- `#/agents` 未显式指定语言时仍默认英文，其他路径未指定时默认中文；语言切换保留当前页面路径。
- 配置与排障页解释 Provider 检查证据、生成与导出失败处理、保存边界和反馈所需版本/任务信息。
- 下载历史显示同一 GitHub Release 的标签、原始说明与对应平台安装包；发布说明中的 `#issue` 引用可打开同仓库 issue。
- 没有凭“issue 已关闭”或“main 已有修复”宣称旧安装包已包含改动，也没有替用户发布 issue 评论或新 Release。

**验证**：官网类型检查、构建与 `website/test/releases.test.mjs` 的四项测试覆盖安装包识别、草稿与缺失平台过滤、API 失败和发布说明 issue 链接。

**限制**：测试中的 Release 数据使用本地 fixture；本轮不证明 GitHub 上已上传新安装包，也未将本地官网构建部署到线上。

## 验证结果与范围

- 根任务记录：全量单元测试 2014 项通过、4 项跳过；不是 2018 项全部通过。
- 根任务记录：App/后台/CLI/官网全量类型检查和 ESLint 已通过，官网四项测试已通过。
- 根任务记录：CLI、后台和官网构建已通过。
- Renderer 正式构建通过。通过按需加载 FIELD 章节、交付与邀请面板，CanvasBoard 静态入口为 539.6 kB gzip，低于原有 547 kB 预算；没有放宽预算。
- 真实网页已验证 AURA 画板当前预览 V3、最终稿 V2，交付新条目默认选 V2；保存配方并重载后，最终稿 V2 仍在。
- 网页的导入入口打开隐藏后台进程的原生文件对话框，不能按浏览器 `filechooser` 自动操作。本轮未完成这个系统文件选择器的自动验证，也未修改导入流程来绕过它。
- 为继续验证 FIELD 章节，根任务用真实 `parseBoardArchive`、`BoardStore`、`AssetStore`、`HistoryStore` 把公开 FIELD `.itb` 装入 `tmp/product-improvements-final/user-data/workspace` 隔离 fixture。该动作不涉及正式数据或模型。真实网页已验证源图章节切到 V1、改色章节切到 V2；从区域编辑画出蒙版并保存 Agent 请求，CLI 确认固定 V2、蒙版已落盘、状态 ready，且没有对应模型执行任务。导出章节预填并保存 hero/scene/campaign 三文件配方，主图交付固定 V1，当前预览仍为 V2。
- 独立审查修复了修改请求完成事件的真实画板 ID，并加入离线完整执行回归；补齐三个既有库组件测试的真实语言 Provider，未关闭产品错误检查。
- 真实服务商的收费请求、可见桌面 App 功能测试、正式安装包发布与官网部署均不在本轮已验证结果中。

后续发布前应以最终构建产物和准确 Release 标签更新本节；安装包与官网上线前，不能把这份开发记录当作已发布版本说明。

实际界面截图保存在本轮 artifacts 的 ai-canvas-plugin 目录：field-chapters-live.png、agent-request-live.png、field-delivery-live.png、final-version-delivery.png。保存请求的独立核对记录为 tmp/product-improvements/agent-request-verification.json。
