/**
 * 素材库改版引入的共享动画常量。
 * 注意：仓库其余组件各自内联了 EASE_OUT，本文件只供新代码引用（scope 控制，不做全局重构）。
 */

/** 项目通用缓出曲线（与各组件内联的 EASE_OUT 一致）。 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** 进场专用的 expo 缓出：更快到位、尾段更绵长，适合首屏 stagger。 */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** 首屏进场：参数对齐 React Bits Masonry 的下方错峰 + 模糊转清晰。 */
export const ENTRANCE_DURATION = 0.8;
export const ENTRANCE_STAGGER = 0.05;
export const ENTRANCE_MAX_DELAY = 0.48;
export const ENTRANCE_Y = 96;
export const ENTRANCE_BLUR = 10;
/** 首屏卡片从可视区域底部之外开始，避免只有轻微位移而难以感知。 */
export const ENTRANCE_VIEWPORT_MARGIN = 160;

/** 筛选/加载新增卡片的错峰淡入间隔与上限。 */
export const ADDITION_STAGGER = 0.03;
export const ADDITION_MAX_DELAY = 0.24;

/** 真图在 thumbhash 占位上的渐显时长。 */
export const IMAGE_REVEAL_DURATION = 0.25;

/** 筛选切换时留存卡片滑移到新位置的时长。 */
export const REFLOW_DURATION = 0.6;

/** React Bits Masonry 风格的整卡悬停回缩。 */
export const HOVER_SCALE = 0.95;
export const HOVER_DURATION = 0.3;

/** 筛选移除卡片的退场时长。 */
export const EXIT_DURATION = 0.18;
