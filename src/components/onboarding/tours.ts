import type { TourDefinition } from "./FeatureTour";

/**
 * 各功能引导共享 FeatureTour 运行时。
 * 锚点是组件里的 data-tour 属性（TopBar / PromptDock / EditLightbox），
 * 步骤内容大改时 bump version，会对老用户重新展示一次。
 */

/** 画板引导的模拟生成演示：自动输入的文案与演示图（App 负责插入/清理）。 */
export const TOUR_DEMO_IMAGE_ID = "tour-demo-image";
export const TOUR_DEMO_PROMPT = "一盏磨砂玻璃便携小夜灯，拉丝金属底座，暖光微亮，鼠尾草绿纯色背景，产品摄影";

export const BOARD_TOUR: TourDefinition = {
  id: "board",
  version: 1,
  steps: [
    {
      id: "welcome",
      variant: "welcome",
      title: "欢迎来到 Iterlay",
      body: "先看一遍常用工作流，再进入画板完成第一次生成。"
    },
    {
      id: "generate",
      selectors: ['[data-tour="prompt-card"]'],
      placement: "top",
      title: "先看一次完整生成",
      body: "接下来会自动填写一段画面描述，并把生成结果放到画布上。你暂时不需要操作。",
      nextLabel: "开始演示"
    },
    {
      id: "demo-type",
      selectors: ['[data-tour="prompt-card"]'],
      placement: "top",
      title: "第一步：说清想要什么",
      body: "先写主体，再补充材质、光线和背景。系统正在替你输入一段示例。",
      autoAdvanceMs: 3400
    },
    {
      id: "demo-generating",
      selectors: [`.react-flow__node[data-id="${TOUR_DEMO_IMAGE_ID}"]`],
      lazy: true,
      placement: "right",
      spotlightPadding: 8,
      title: "已提交，可以继续工作",
      body: "生成任务会留在画布上显示进度。等待时不用停在这里，还可以继续提交新的想法。",
      autoAdvanceMs: 3600
    },
    {
      id: "demo-result",
      selectors: [`.react-flow__node[data-id="${TOUR_DEMO_IMAGE_ID}"]`],
      lazy: true,
      placement: "right",
      spotlightPadding: 8,
      title: "结果会回到原来的位置",
      body: "完成后，图片会直接替换进度卡。正式创作时，可以拖动它比较，也可以双击继续修改。"
    },
    {
      id: "tools",
      selectors: ['[data-tour="dock-reference"]', '[data-tour="dock-template"]'],
      placement: "top",
      title: "需要更可控时，加参考",
      body: "参考图用来保留主体或风格，模板用来补全常见场景。生成模型、尺寸和数量也在输入区调整。"
    },
    {
      id: "navigate",
      selectors: ['[data-tour="zoom"]', '[data-tour="fit-view"]'],
      placement: "top",
      title: "快速回到想看的位置",
      body: "滚轮缩放，按住空格拖动画布；找不到内容时，点「适应画布」恢复全览。双击图片可进入编辑。"
    },
    {
      id: "history",
      selectors: ['[data-tour="history"]', '[data-tour="comment"]'],
      placement: "bottom",
      title: "回到一次生成，或留下反馈",
      body: "「历史」按批次保留描述、参数和结果；「评论」让反馈直接留在对应图片上。"
    },
    {
      id: "board-switcher",
      selectors: ['[data-tour="board-switcher"]'],
      placement: "bottom",
      title: "画板名也是管理入口",
      body: "双击名称可以改名，单击会打开画板菜单。选择「打开菜单」继续查看。",
      nextLabel: "打开菜单"
    },
    {
      id: "menu-boards",
      selectors: ['[data-tour="menu-all-boards"]', '[data-tour="menu-recent-list"]'],
      lazy: true,
      placement: "right",
      title: "在不同项目之间切换",
      body: "从最近画板直接继续，或进入「全部画板」查找更早的项目。每块画板都会保留离开时的状态。"
    },
    {
      id: "menu-manage",
      selectors: ['[data-tour="menu-rename"]', '[data-tour="menu-create"]'],
      lazy: true,
      placement: "right",
      title: "从这里整理画板",
      body: "给当前画板换一个清楚的名称，或为新的项目新建画板。"
    },
    {
      id: "menu-replay",
      selectors: ['[data-tour="menu-replay"]'],
      lazy: true,
      placement: "right",
      title: "需要时再看一遍",
      body: "之后如果忘了某个操作，可以从这里重新播放引导。现在可以结束引导，开始自己的创作。"
    }
  ]
};

export const LIBRARY_TOUR: TourDefinition = {
  id: "library",
  version: 1,
  steps: [
    {
      id: "saved",
      selectors: ['[data-tour="library-current-board"]'],
      placement: "bottom",
      title: "离开画板，内容仍在",
      body: "当前画板已自动保存。下次从这张卡片进入，会回到刚才的画布、历史和评论。"
    },
    {
      id: "create",
      selectors: ['[data-tour="library-actions"]'],
      placement: "bottom",
      title: "从新画板开始，或带回旧项目",
      body: "选择「新建画板」开始新项目；选择「导入」恢复之前导出的画板文件，也可以直接拖入文件。"
    },
    {
      id: "nav",
      selectors: ['[data-tour="library-nav"]'],
      placement: "right",
      title: "按用途找到需要的内容",
      body: "「画板库」继续项目，「素材库」复用图片，「模版库」套用场景描述。"
    },
    {
      id: "settings",
      selectors: ['[data-tour="library-settings"]'],
      placement: "right",
      title: "需要调整时再来这里",
      body: "在「设置」中更换生成服务、下载位置和使用偏好；有新版本时，更新入口会显示提醒。"
    }
  ]
};

export const GALLERY_TOUR: TourDefinition = {
  id: "gallery",
  version: 1,
  steps: [
    {
      id: "entry",
      selectors: ['[data-tour="gallery-entry"]'],
      placement: "bottom",
      title: "从这里回看创作过程",
      body: "画廊会把这个画板的生成记录按时间整理。选择「打开画廊」进入，也可以之后按 G 快速打开。",
      nextLabel: "打开画廊"
    },
    {
      id: "timeline",
      selectors: ['[data-tour="gallery-timeline"]'],
      lazy: true,
      placement: "right",
      title: "先选择要回看的日期",
      body: "左侧时间轴显示每天的生成数量。选择某一天，右侧只展示当天的记录。"
    },
    {
      id: "modes",
      selectors: ['[data-tour="gallery-modes"]'],
      lazy: true,
      placement: "bottom",
      title: "换一种适合你的浏览方式",
      body: "灯箱适合逐个查看，环形适合快速漫游，胶片适合按顺序回顾。切换模式不会改变记录。"
    },
    {
      id: "generations",
      selectors: ['[data-tour="gallery-generations"]'],
      lazy: true,
      placement: "left",
      title: "在生成批次之间移动",
      body: "移动或点击可切换生成批次；打开某一批后，可以逐张查看当时的候选结果。"
    },
    {
      id: "prompt-actions",
      selectors: ['[data-tour="gallery-prompt-actions"]'],
      lazy: true,
      placement: "top",
      title: "把好结果带回下一次生成",
      body: "这里保留了当时的描述。可以复制文字、连同设置一起复用，或回到画板定位对应图片。"
    },
    {
      id: "assistant",
      selectors: ['[data-tour="gallery-assistant"]'],
      lazy: true,
      placement: "bottom",
      title: "不知道从哪看，就问回顾助手",
      body: "让助手比较当前候选、总结一段时间内的变化，或找出值得继续尝试的描述方向。"
    }
  ]
};

export const EDIT_TOUR: TourDefinition = {
  id: "edit",
  version: 1,
  steps: [
    {
      id: "context",
      selectors: ['[data-tour="edit-banner"]'],
      placement: "top",
      title: "现在只修改这张图",
      body: "接下来的生成会成为它的新版本，不会覆盖原图。需要回到画板时，点编辑栏右侧的 ×。"
    },
    {
      id: "describe",
      selectors: ['[data-tour="prompt-card"]'],
      placement: "top",
      title: "直接描述要改的地方",
      body: "例如「把背景换成纯白」，然后按 Enter。输入框上方的建议也可以直接采用。"
    },
    {
      id: "preview",
      selectors: ['[data-tour="edit-tools"]'],
      // 工具列在聚焦动画结束后才挂载，跳过挂载时过滤、运行时再定位。
      lazy: true,
      placement: "left",
      title: "查看细节，再决定保留哪个版本",
      body: "用右侧工具放大或下载当前版本；生成多个版本后，从图片下方切换比较。"
    }
  ]
};
