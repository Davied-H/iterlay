import type { ProviderConfig, TextProviderConfig, VideoProviderConfig } from "./providers.js";
import type { PiAgentBuiltinToolName, AssistantIntentSuggestionCount, MemoryUsageLevel } from "./assistant.js";
import type { BoardTrashRetentionDays } from "./board.js";

/** 编辑态点击图片查看提示词的方式：flip=图片翻转背面展示；panel=右侧打字机面板。 */
export type EditInfoMode = "flip" | "panel";

/** 画板图片的双击动作：进入编辑、加入参考图，或聚焦放大图片。 */
export type ImageDoubleClickAction = "edit" | "reference" | "focus";

/** “复制原图”写入系统剪贴板时使用的图片格式。 */
export type CopyImageFormat = "png" | "gif";

/** 版本分离语义：copy 保留原版本栈，extract 从原版本栈移出。 */
export type VersionSeparationMode = "copy" | "extract";

/** 画板底部主生成按钮的视觉样式。 */
export type GenerateButtonStyle = "folded" | "glow" | "prismatic" | "send";

export type BuiltinAppIconPreference = "default" | "mascot";

/** 应用在 Dock、任务栏和窗口中使用的图标。 */
export type AppIconPreference = BuiltinAppIconPreference | `custom:${string}`;

/** 用户上传并保存在本机的伙伴头像。 */
export interface CustomAppIcon {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: string;
}

export interface AppIconLibrary {
  appIcon: AppIconPreference;
  customAppIcons: CustomAppIcon[];
}

export interface UploadAppIconRequest {
  name: string;
  dataUrl: string;
}

export type OnboardingStatus = "completed" | "skipped" | "seen";

export interface OnboardingRecord {
  status: OnboardingStatus;
  at: string;
}

export type OnboardingState = Record<string, OnboardingRecord>;

export interface AppSettings {
  /** 已保存的 provider 列表；至少一个。 */
  providers: ProviderConfig[];
  /** 当前激活（默认生成用）的 provider id，需存在于 providers 中。 */
  activeProviderId: string;
  /** 已保存的文本 Provider 列表（AI 智能辅助用）；至少包含官方内置项。 */
  textProviders: TextProviderConfig[];
  /** 当前激活的文本 provider id，需存在于 textProviders 中。 */
  activeTextProviderId: string;
  /** 已保存的视频 Provider 列表。 */
  videoProviders: VideoProviderConfig[];
  /** 新建视频生成节点默认使用的 Provider。 */
  activeVideoProviderId: string;
  /** 应用界面语言；system 会跟随操作系统语言。 */
  language: import("../i18n.js").AppLanguage;
  theme: "light" | "dark" | "system";
  /** 底部输入框是否启用"失焦收窄 / 聚焦展开"，默认关闭。 */
  promptDockAutoCollapse: boolean;
  /** 是否显示视频改编和继续生成入口，默认关闭。 */
  advancedVideoModesEnabled?: boolean;
  /** 画板缩小时是否使用低分辨率缩略图，默认关闭。 */
  canvasThumbnailPreview: boolean;
  /** 是否显示画布小地图，默认开启。 */
  canvasMinimapVisible?: boolean;
  /** 是否显示画板评论入口与标记并启用快捷键，默认关闭。 */
  boardCommentsEnabled?: boolean;
  /** 是否显示画廊入口并启用快捷键，默认关闭。 */
  boardGalleryEnabled?: boolean;
  /** 是否在悬停画板图片时显示操作工具栏，默认关闭。 */
  canvasImageToolbarOnHover?: boolean;
  /** 是否在悬停画布节点时突出其关联关系并弱化其他节点，默认关闭。 */
  canvasRelationshipHoverHighlight?: boolean;
  /** 是否显示实验性的微信表情导出入口，默认关闭。 */
  wechatStickerExportEnabled?: boolean;
  /** 是否允许通过 Manager 创建图片的公网快速分享，默认开启。 */
  onlineImageSharingEnabled?: boolean;
  /** “复制原图”的目标格式，默认 png。 */
  copyImageFormat?: CopyImageFormat;
  /** 是否在画板输入框上方显示快捷建议，默认关闭。 */
  boardSmartSuggestionsEnabled?: boolean;
  /** 是否启用画板 AI 助手入口与快捷键，默认开启。 */
  boardAssistantEnabled?: boolean;
  /** 是否使用 Pi Agent 驱动画板助手，默认关闭。 */
  boardAssistantAgentModeEnabled?: boolean;
  /** 是否让所有用户可见助手统一使用 Pi Agent，默认关闭。 */
  assistantAgentModeEnabled?: boolean;
  /** Agent 会话启用的 Pi 内置工具。 */
  piAgentBuiltinTools?: PiAgentBuiltinToolName[];
  /** Agent 会话启用的 Iterlay MCP 工具；Web 搜索和终结工具始终保留。 */
  piAgentIterlayTools?: string[];
  /** 已启用的 Skill 文件或目录路径。 */
  piAgentSkillPaths?: string[];
  /** 已启用的 Pi 扩展文件或目录路径。 */
  piAgentExtensionPaths?: string[];
  /** 用户追加到发现范围的 Skill 路径。 */
  piAgentCustomSkillPaths?: string[];
  /** 用户追加到发现范围的扩展路径。 */
  piAgentCustomExtensionPaths?: string[];
  /** 单次可见助手请求允许的最大 Agent 轮数。 */
  piAgentMaxTurns?: number;
  /** 单次 Web 搜索默认允许返回的最大结果数。 */
  piAgentWebSearchMaxResults?: number;
  /** 是否在输入文字或添加引用后自动感知并解析上下文，默认开启。 */
  boardAssistantAwarenessEnabled?: boolean;
  /** 是否在画板 AI 助手中生成后续问题推荐，默认开启。 */
  boardAssistantIntentSuggestionsEnabled?: boolean;
  /** 画板 AI 助手每次生成的意图建议数量，默认 3，最多 5。 */
  boardAssistantIntentSuggestionCount?: AssistantIntentSuggestionCount;
  /** 是否在图片编辑时生成智能建议，默认开启。 */
  editSmartSuggestionsEnabled?: boolean;
  /** 是否记录并在 AI 助手中使用创作记忆，默认开启。 */
  memoryEnabled?: boolean;
  /** 记忆召回范围和上下文预算。 */
  memoryUsageLevel?: MemoryUsageLevel;
  /** 编辑态点击图片查看提示词的方式，默认 flip。 */
  editInfoMode?: EditInfoMode;
  /** 双击画板图片时执行的动作，默认 edit。 */
  imageDoubleClickAction?: ImageDoubleClickAction;
  /** 图片与批量压缩包的自动下载目录；首次下载时由用户选择。 */
  downloadDirectory?: string;
  /** CLI 未指定画板时的默认目标；空字符串表示使用「CLI 创作」。 */
  cliDefaultBoardId?: string;
  /** 版本分离默认保留原版本栈。 */
  versionSeparationMode?: VersionSeparationMode;
  /** 画板底部主生成按钮样式，默认 folded。 */
  generateButtonStyle?: GenerateButtonStyle;
  /** 应用图标，默认使用 Iterlay 品牌标志。 */
  appIcon?: AppIconPreference;
  /** 用户上传的伙伴头像历史。 */
  customAppIcons?: CustomAppIcon[];
  /** 回收站保留天数；0 表示永不自动清理，默认 3 天。 */
  boardTrashRetentionDays?: BoardTrashRetentionDays;
}

/** 对现有设置做原子增量更新，未提供的字段保持不变。 */
export type AppSettingsPatch = Partial<AppSettings>;
