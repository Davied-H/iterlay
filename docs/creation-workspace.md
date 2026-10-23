# 创作助手会话

创作助手使用一个持续的 `CreationSession` 关联消息、运行事件、参考素材和成果。会话保存在开发或安装环境各自的 `creation-sessions.json`；图片和视频仍由画板及现有媒体任务持有，会话只记录 ID 和受管素材路径。项目目录保存在工作台本地设置中，会话通过 `projectId` 归组，未分组的旧会话继续显示在最近聊天。

## Agent 回复与执行

创作入口始终使用 Agent 模式。本轮可通过普通文字结束，不注册或强制调用 `finish_assistant_result`，也不进入只补交结果的修复阶段。底层兼容文本 Provider 的工具决策仍使用 `{text, toolCalls}` 传输；`toolCalls: []` 表示文字回复结束，不要求额外的创作结果 JSON。

生成、编辑和画板创建由真实业务工具执行，问答、确认与方向选择由交互工具承接。界面通过任务回执展示成果，不从最终回复的 `actions` 或 `commitment` 自动提交生成。历史方案的手动操作入口仍可使用。格式错误、调用上限或上游失败会显式报错，不自动重放已执行操作。模板提取等仍需结构化字段的入口继续沿用其原有协议。

## 交互与恢复

### 需求问答组件

`src/components/assistant/questions/` 提供共享的基础组件：`SingleChoice`（单选）、`MultipleChoice`（多选）、`TextAnswer`（短文本或多行文本）、`AnswerSupplement`（补充说明）和 `QuestionField`（题目容器）。这些组件通过 `value/onChange` 受控组合，不持有问卷流程状态。

`AssistantQuestionnaire` 负责逐题展示、进度、上一题/下一题、必答校验及最终统一提交。切换题目保留所有答案，单题沿用原来的直接提交体验；旧 `CreateQuestionCard` 导出作为兼容入口。画板问答继续替换底部输入区。

字段沿用 `type: text | textarea | select`，`select + multiple: true` 表示多选。选择题默认支持补充说明，可仅用补充文本表达自定义答案；`allowSupplement: false` 关闭本题补充输入，`true` 也可为文本题增加补充输入。答案沿用字段 ID，补充文本沿用 `assistantInteractionSupplementKey(id)`，现有 Agent 工具和历史格式保持兼容。

### 会话行为

- 会话可搜索、重命名、置顶、归档，也可移动到项目目录。项目可新建、重命名、删除；删除目录只解除聊天归组，不删除聊天。切换或离开页面时写入当前草稿和快照；历史问答记录继续可读。
- Agent 的流式文本、工具状态、问答与授权显示在同一会话。工具过程留在消息内，正文已开始流式输出时不再重复显示等待状态。
- 执行中的普通发送默认加入下一轮。若 Pi Agent 已开放当前运行的 steering 窗口，还可明确点“补充当前执行”；宿主用原会话的 `session.steer()` 在当前工具完成后交付。媒体工具一旦开始，此入口收起，后续输入进入下一轮。steer 窗口已关闭或发送失败时也回退到队列。
- 刷新后保留的队列暂停，用户点击“继续处理补充”才会再次调用 Agent。外部媒体任务不会被隐式取消或改写。
- 产物预览从 `boards:get` 的受管资源 URL 读取；视频任务恢复还会查询 `getVideoJob`。Agent 直接调用媒体工具时，页面读取工具回执中的真实任务 ID，并从图片/视频任务及画板核对产物，不会另行提交媒体生成。已交付的产物会结清对应方案，避免刷新后出现重复生成按钮。
- 参考图和画板素材会通过原有安全路径进入 Agent 及媒体生成。持久会话不写入图片像素或临时资源 URL；引用失效时请求会明确失败。
- 输入框中的引用图以小缩略图显示，点击可读取受管原图预览；右上角删除按钮在悬停或键盘聚焦时出现，触屏持续显示。素材用途仍可切换参考风格或编辑主体。

## 插件产物

插件可在 manifest 中声明产物种类和权限：

```json
{
  "permissions": ["board:read", "creation:present"],
  "creationArtifacts": [
    { "kind": "example.plugin:poster", "label": "品牌海报", "mediaType": "image" }
  ]
}
```

插件创建并保存画板节点后，可调用：

```ts
await iterlay.creation.present({
  conversationId,
  kind: "example.plugin:poster",
  nodeId,
  prompt: "本轮创作要求"
});
```

宿主检查插件授权、声明的种类、目标会话、当前画板节点与资源路径，然后原子地将成果加入会话。图片、视频与项目使用共享预览；需要专用视图的宿主扩展可调用 `registerCreationArtifactRenderer(kind, renderer)`，卸载时执行返回的注销函数。插件 HTML 仍在既有沙箱中运行，不能直接注册宿主 React 组件。
