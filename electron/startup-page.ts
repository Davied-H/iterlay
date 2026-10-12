import type { ResolvedAppLocale } from "../shared/i18n.js";

export interface StartupPageOptions {
  dark: boolean;
  locale?: ResolvedAppLocale;
}

export function buildStartupPage({ dark, locale = "zh-CN" }: StartupPageOptions): string {
  const background = dark ? "#121212" : "#fafafa";
  const foreground = dark ? "#f2f2f2" : "#171717";
  const shadow = dark ? "rgb(0 0 0 / 25%)" : "rgb(35 55 106 / 10%)";
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Iterlay</title><style>
:root{color-scheme:${dark ? "dark" : "light"};font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
html,body{min-height:100%;margin:0;overflow:hidden;background:${background};color:${foreground}}
*{box-sizing:border-box}.boot{display:flex;min-height:100vh;flex-direction:column;align-items:center;justify-content:center;gap:20px;isolation:isolate;-webkit-app-region:drag}
.mark{position:relative;width:96px;height:86px;contain:layout paint style}.mark svg,.layer{position:absolute;inset:0;width:100%;height:100%}
.layer{display:block;opacity:0;transform-origin:center;backface-visibility:hidden;will-change:transform,opacity;animation:settle 1.5s cubic-bezier(.22,1,.36,1) infinite both}
.shadow{fill:${shadow}}.top{--fx:15px;--fy:-16px;--tx:-4px;--ty:4px}.middle{--fx:20px;--fy:2px;--tx:-5px;--ty:-1px;animation-delay:.08s}.bottom{--fx:-16px;--fy:15px;--tx:4px;--ty:-4px;animation-delay:.16s}
.face{fill:#2f61e8;stroke:rgb(39 79 176 / 32%);stroke-width:.75}.edge{fill:#16368f}strong{font-size:18px;font-weight:600;line-height:1}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@keyframes settle{0%{opacity:0;transform:translate3d(var(--fx),var(--fy),0) scale(.94)}24%,70%{opacity:1;transform:translate3d(0,0,0) scale(1)}86%,100%{opacity:0;transform:translate3d(var(--tx),var(--ty),0) scale(.985)}}
@media(prefers-reduced-motion:reduce){.layer{animation:none;opacity:1}}
</style></head><body><main class="boot" role="status" aria-live="polite">
<div class="mark" role="img" aria-label="Iterlay"><svg class="shadow" viewBox="0 0 120 108" aria-hidden="true"><ellipse cx="56" cy="101" rx="30" ry="3.5"/></svg>
<span class="layer top"><svg viewBox="0 0 120 108" aria-hidden="true"><path class="edge" d="M56 8h50L86 32H36L56 8Z"/><path class="face" d="M56 4h50L86 28H36L56 4Z"/></svg></span>
<span class="layer middle"><svg viewBox="0 0 120 108" aria-hidden="true"><path class="edge" d="M36 42h50L66 66H16l20-24Z"/><path class="face" d="M36 38h50L66 62H16l20-24Z"/></svg></span>
<span class="layer bottom"><svg viewBox="0 0 120 108" aria-hidden="true"><path class="edge" d="M16 76h50l-20 24H0l16-19.2V76Z"/><path class="face" d="M16 72h50L46 96H0l16-19.2V72Z"/></svg></span></div>
<strong>Iterlay</strong><span class="sr">${locale === "zh-CN" ? "正在打开 Iterlay" : "Opening Iterlay"}</span></main></body></html>`;
}
