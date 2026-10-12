import type { ResolvedAppLocale } from "@shared/i18n";
import { enUS, zhCN } from "./messages";

const catalogEntries = Object.keys(zhCN).map((key) => {
  const messageKey = key as keyof typeof zhCN;
  return [zhCN[messageKey], enUS[messageKey]] as const;
});

const legacyEnglish: Record<string, string> = {
  "工作区暂时无法显示": "Workspace temporarily unavailable",
  "已保存的画板仍在本机。重新加载通常可以恢复界面。": "Your saved boards are still on this device. Reloading usually restores the workspace.",
  "无需重新创建工作区": "No need to recreate your workspace",
  "重新加载": "Reload",
  "正在重新加载…": "Reloading…",
  "复制诊断信息": "Copy diagnostics",
  "诊断信息已复制，可以直接发给开发者。": "Diagnostics copied. You can send them directly to the developer.",
  "复制失败，请在下方手动选择错误详情。": "Copy failed. Select the error details below to copy them manually.",
  "正在带你回到工作区…": "Returning to your workspace…",
  "错误摘要": "Error summary",
  "问题编号": "Error ID",
  "查看技术详情": "View technical details",
  "诊断信息不包含画板内容、提示词或密钥，个人目录也已隐藏。": "Diagnostics exclude board content, prompts, and keys. Personal directories are hidden.",
  "画板库": "Boards",
  "素材库": "Assets",
  "模版库": "Templates",
  "模板库": "Templates",
  "场景库": "Scenes",
  "灵感库": "Inspiration",
  "历史记录": "History",
  "回收站": "Trash",
  "设置": "Settings",
  "设置分类": "Settings categories",
  "最近画板": "Recent boards",
  "检查更新": "Check for updates",
  "更多": "More",
  "搜索画板": "Search boards",
  "导入": "Import",
  "导入中": "Importing",
  "新建画板": "New board",
  "最近打开": "Recently opened",
  "按最近使用排序": "Sorted by recent use",
  "当前": "Current",
  "打开": "Open",
  "正在打开画板": "Opening board",
  "搜索结果": "Search results",
  "所有画板": "All boards",
  "画板": "Board",
  "图片": "Images",
  "最近更新": "Recently updated",
  "空间": "Storage",
  "创建时间": "Date created",
  "操作": "Actions",
  "从空白画板开始": "Start with a blank board",
  "张图片 · 更新": "images · Updated",
  "· 创建": "· Created",
  "重命名": "Rename",
  "创建副本": "Duplicate",
  "导出 .itb": "Export .itb",
  "移入回收站": "Move to trash",
  "选择第一步": "Choose the first step",
  "导入、粘贴，或从一句描述开始。": "Import, paste, or start with a description.",
  "开始": "Start",
  "灵感": "Inspiration",
  "工作流": "Workflow",
  "最近": "Recent",
  "选择一个画面方向": "Choose a visual direction",
  "选中的描述会带入下方输入区。": "The selected description will be added to the prompt below.",
  "从第一张图开始推进": "Build from the first image",
  "参考、生成和变体会留在同一个画板。": "References, generations, and variants stay on the same board.",
  "继续最近创作": "Continue recent work",
  "点击或拖动一张素材添加到画板。": "Click or drag an asset onto the board.",
  "导入图片": "Import image",
  "选择本地素材": "Choose a local asset",
  "粘贴图片": "Paste image",
  "使用剪贴板内容": "Use clipboard content",
  "从描述开始": "Start with a description",
  "生成第一张画面": "Generate the first image",
  "打开输入区": "Open prompt",
  "从示例开始": "Start with an example",
  "首次推荐": "Recommended for your first try",
  "选择开始方式": "Choose how to start",
  "暂无最近素材": "No recent assets",
  "构思": "Concept",
  "生成": "Generate",
  "建立主画面": "Create the main image",
  "变体": "Variants",
  "探索更多方向": "Explore more directions",
  "添加最近素材": "Add recent assets",
  "从最近创作中选择要放入当前画板的素材。": "Choose assets from recent work to add to this board.",
  "还没有最近素材": "No recent assets yet",
  "导入或生成图片后会出现在这里。": "Imported or generated images will appear here.",
  "描述你想要的画面…（Enter 生成）": "Describe the image you want… (Enter to generate)",
  "自动": "Auto",
  "生成数量": "Number of images",
  "减少生成数量": "Decrease image count",
  "增加生成数量": "Increase image count",
  "AI 模型": "AI models",
  "默认模型": "Default model",
  "Iterlay 会在对应功能中自动使用这些模型。": "Iterlay automatically uses these models for the corresponding features.",
  "管理模型": "Manage models",
  "图片生成": "Image generation",
  "生成、编辑和参考图": "Generation, editing, and references",
  "官方图片模型": "Official image model",
  "Iterlay 官方": "Iterlay official",
  "AI 助手": "AI assistant",
  "提示词、协作和图片分析": "Prompts, collaboration, and image analysis",
  "画板设置": "Board",
  "AI 功能": "AI features",
  "系统配置": "System",
  "画板 AI": "Board AI",
  "在画板输入区显示 AI 助手入口，并启用对应快捷键。": "Show the AI assistant in the board prompt area and enable its shortcut.",
  "AI 感知": "AI awareness",
  "添加引用或输入文字后，自动识别上下文、解析意图并给出建议。": "Recognize context, interpret intent, and suggest improvements after you add references or text.",
  "后续问题推荐": "Follow-up suggestions",
  "在助手对话底部显示可继续追问的推荐问题。": "Show suggested follow-up questions below assistant responses.",
  "推荐问题数量": "Number of suggestions",
  "控制每次显示的后续问题数量。": "Control how many follow-up questions are shown.",
  "默认": "Default",
  "最多": "Maximum",
  "编辑 AI": "Editing AI",
  "AI 编辑建议": "AI editing suggestions",
  "进入图片编辑时自动生成修改建议。": "Generate editing suggestions when you open image editing.",
  "AI 助手记忆": "Assistant memory",
  "使用记忆": "Use memory",
  "记录近期提示词、创作操作和评论，在调用助手时作为可选参考。内容保存在本机。": "Keep recent prompts, creative actions, and comments as optional context for the assistant. Data stays on this device.",
  "使用程度": "Memory usage",
  "控制助手参考历史的范围和数量；当前指令始终优先。": "Control how much history the assistant may reference. Current instructions always take priority.",
  "记忆使用程度": "Memory usage level",
  "谨慎": "Cautious",
  "当前画板 · 近 7 天": "Current board · Last 7 days",
  "平衡": "Balanced",
  "相关场景 · 近 90 天": "Related scenes · Last 90 days",
  "积极": "Active",
  "更广范围 · 近 1 年": "Broader context · Last year",
  "本地记忆": "Local memory",
  "正在读取记忆状态…": "Loading memory status…",
  "查看": "View",
  "清除": "Clear",
  "生成与输入": "Generation and input",
  "生成按钮样式": "Generate button style",
  "选择画板底部主生成按钮的视觉效果。": "Choose the visual style of the board's primary generate button.",
  "折角粒子": "Folded particles",
  "选择折角粒子样式": "Choose folded particle style",
  "光环星芒": "Halo starburst",
  "选择光环星芒样式": "Choose halo starburst style",
  "幻彩流光": "Prismatic shimmer",
  "选择幻彩流光样式": "Choose prismatic shimmer style",
  "飞行发送": "Fly to send",
  "选择飞行发送样式": "Choose fly-to-send style",
  "输入框锚点展开收起": "Adaptive prompt dock",
  "开启后，底部输入框失去焦点时收窄，聚焦时平滑展开；关闭则始终保持宽模式。": "When enabled, the prompt dock narrows when unfocused and expands smoothly on focus.",
  "高级视频模式": "Advanced video modes",
  "开启后显示视频改编和继续生成入口；关闭时仅保留新建视频。": "Show video adaptation and continuation tools. When disabled, only new video generation is available.",
  "常用场景快捷建议": "Quick scene suggestions",
  "在输入框上方显示常用场景建议；关闭后隐藏整条建议栏。": "Show common scene suggestions above the prompt field.",
  "图片操作": "Image actions",
  "复制图片格式": "Copy image format",
  "设置“复制原图”和对应快捷键写入系统剪贴板的格式。": "Choose the format used by Copy Original and its keyboard shortcut.",
  "高清静态图，保留完整色彩": "High-quality still image with full color",
  "保留动图；静态图转为单帧 GIF": "Preserve animation; convert stills to single-frame GIF",
  "微信表情导出": "WeChat sticker export",
  "实验性功能。开启后，图片菜单和多选工具栏会显示微信表情导出入口。": "Experimental. Adds WeChat sticker export to image menus and the multi-select toolbar.",
  "悬停图片时显示工具栏": "Show toolbar on image hover",
  "开启后，将鼠标移到图片上即可显示操作工具栏；关闭时需先点击选中图片。": "When enabled, hovering an image reveals its action toolbar.",
  "双击画板图片": "Double-click board image",
  "设置在画板中双击图片时触发的快捷操作。": "Choose the action triggered by double-clicking an image on the board.",
  "进入编辑": "Enter edit mode",
  "打开编辑模式": "Open edit mode",
  "添加到引用": "Add to references",
  "加入输入框参考图": "Add to prompt references",
  "聚焦图片": "Focus image",
  "居中并放大（默认）": "Center and zoom (default)",
  "编辑态查看图片信息": "Image info in edit mode",
  "编辑模式下点击图片，用哪种方式展示它的提示词与引用图。": "Choose how prompts and references appear when you click an image in edit mode.",
  "图片翻转": "Flip image",
  "点击图片翻到背面看提示词": "Click an image to flip over and view its prompt",
  "右侧面板": "Right panel",
  "右侧滑出，打字机展示提示词": "Slide in from the right and reveal the prompt",
  "画布显示与性能": "Canvas display and performance",
  "显示画布小地图": "Show canvas minimap",
  "在画布左下角显示全局缩略图；小地图可通过顶部抓手移动位置。": "Show an overview in the lower-left corner. Drag its handle to reposition it.",
  "缩小画板时使用缩略图": "Use thumbnails when zoomed out",
  "性能优化。开启后，低倍率画板使用较小预览图以降低显存占用；关闭时始终显示原图。": "Performance option. Uses smaller previews at low zoom to reduce graphics memory usage.",
  "版本管理": "Version management",
  "版本分离方式": "Version separation",
  "设置从版本栈分离单个版本或全部版本时，是否保留原版本栈。": "Choose whether separating versions keeps the original version stack.",
  "复制分离": "Separate a copy",
  "保留原版本栈（默认）": "Keep original stack (default)",
  "直接分离": "Separate directly",
  "从原版本栈移出": "Remove from original stack",
  "外观": "Appearance",
  "语言": "Language",
  "跟随系统": "Follow system",
  "简体中文": "简体中文",
  "主题": "Theme",
  "浅色": "Light",
  "深色": "Dark",
  "应用图标": "App icon",
  "品牌标志": "Brand mark",
  "伙伴头像": "Companion avatar",
  "可自定义": "Customizable",
  "存储": "Storage",
  "下载目录": "Download folder",
  "首次下载时选择目录": "Choose on first download",
  "选择下载目录": "Choose download folder",
  "应用": "Apply",
  "当前使用": "In use",
  "管理伙伴头像": "Manage companion avatars",
  "更新": "Updates",
  "参与开发者计划（Beta）": "Join the developer program (Beta)",
  "抢先接收 Beta 测试版更新推送。Beta 版本可能不稳定，可随时退出，退出后会在下一个正式版发布时回到稳定通道。": "Get Beta updates early. Beta builds may be unstable; leave anytime to return to stable with the next public release.",
  "高级设置": "Advanced",
  "去配置": "Configure",
  "已打开": "Opened",
  "应用编辑": "Apply edit",
  "已应用": "Applied",
  "已提交": "Submitted"
};

const zhToEn = new Map<string, string>([
  ...catalogEntries,
  ...Object.entries(legacyEnglish)
]);
const enToZh = new Map<string, string>(
  Array.from(zhToEn, ([zh, en]) => [en, zh] as const)
);
enToZh.set("Inspiration", "灵感");
enToZh.set("Templates", "模板");
enToZh.set("Boards", "画板");
enToZh.set("Assets", "素材");

function localizeDynamicChinese(value: string): string | null {
  if (value === "auto") return "Auto";
  let match = /^打开画板\s+(.+)$/u.exec(value);
  if (match) return `Open board ${match[1]}`;
  match = /^问题编号\s+(.+)$/u.exec(value);
  if (match) return `Error ID ${match[1]}`;
  match = /^(\d+)\s*个画板$/u.exec(value);
  if (match) return `${match[1]} ${match[1] === "1" ? "board" : "boards"}`;
  match = /^(\d+)\s*个结果$/u.exec(value);
  if (match) return `${match[1]} ${match[1] === "1" ? "result" : "results"}`;
  match = /^找到\s*(\d+)\s*个画板$/u.exec(value);
  if (match) return `${match[1]} ${match[1] === "1" ? "board" : "boards"} found`;
  match = /^(\d+)\s*个画板，按最近更新排序$/u.exec(value);
  if (match) return `${match[1]} ${match[1] === "1" ? "board" : "boards"}, sorted by recently updated`;
  match = /^(\d+)\s*张图片$/u.exec(value);
  if (match) return `${match[1]} ${match[1] === "1" ? "image" : "images"}`;
  match = /^(\d+)\s*张$/u.exec(value);
  if (match) return `${match[1]} ${match[1] === "1" ? "image" : "images"}`;
  match = /^(\d+)\s*条$/u.exec(value);
  if (match) return match[1];
  match = /^(\d+)\s*条有效记忆\s*·\s*(\d+)\s*条来源记录$/u.exec(value);
  if (match) return `${match[1]} active memories · ${match[2]} source records`;
  match = /^自动\s*·\s*(\d+)\s*张$/u.exec(value);
  if (match) return `Auto · ${match[1]} ${match[1] === "1" ? "image" : "images"}`;
  match = /^(\d+)\s*张图片\s*·\s*更新\s*(.+)\s*·\s*创建\s*(.+)$/u.exec(value);
  if (match) return `${match[1]} ${match[1] === "1" ? "image" : "images"} · Updated ${match[2]} · Created ${match[3]}`;
  match = /^(\d+)\s*分钟前$/u.exec(value);
  if (match) return `${match[1]} min ago`;
  match = /^(\d+)\s*小时前$/u.exec(value);
  if (match) return `${match[1]} hr ago`;
  match = /^(\d+)\s*天前$/u.exec(value);
  if (match) return `${match[1]} d ago`;
  if (value === "刚刚") return "Just now";
  return null;
}

function localizeDynamicEnglish(value: string): string | null {
  if (/^auto$/i.test(value)) return "自动";
  let match = /^(\d+)\s+boards?$/i.exec(value);
  if (match) return `${match[1]} 个画板`;
  match = /^Error ID\s+(.+)$/i.exec(value);
  if (match) return `问题编号 ${match[1]}`;
  match = /^(\d+)\s+results?$/i.exec(value);
  if (match) return `${match[1]} 个结果`;
  match = /^(\d+)\s+boards?\s+found$/i.exec(value);
  if (match) return `找到 ${match[1]} 个画板`;
  match = /^(\d+)\s+boards?, sorted by recently updated$/i.exec(value);
  if (match) return `${match[1]} 个画板，按最近更新排序`;
  match = /^(\d+)\s+images?$/i.exec(value);
  if (match) return `${match[1]} 张图片`;
  match = /^Auto\s*·\s*(\d+)\s+images?$/i.exec(value);
  if (match) return `自动 · ${match[1]} 张`;
  match = /^(\d+)\s+min ago$/i.exec(value);
  if (match) return `${match[1]} 分钟前`;
  match = /^(\d+)\s+hr ago$/i.exec(value);
  if (match) return `${match[1]} 小时前`;
  match = /^(\d+)\s+d ago$/i.exec(value);
  if (match) return `${match[1]} 天前`;
  if (value === "Just now") return "刚刚";
  return null;
}

export function localizeLegacyText(value: string, locale: ResolvedAppLocale): string {
  const leading = value.match(/^\s*/u)?.[0] ?? "";
  const trailing = value.match(/\s*$/u)?.[0] ?? "";
  const core = value.slice(leading.length, value.length - trailing.length);
  if (!core) return value;
  const translated = locale === "en-US"
    ? zhToEn.get(core) ?? localizeDynamicChinese(core)
    : enToZh.get(core) ?? localizeDynamicEnglish(core);
  return translated ? `${leading}${translated}${trailing}` : value;
}
