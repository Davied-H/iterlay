import path from "node:path";

export interface WechatMobileSharePageInput {
  packageName: string;
  stickerNames: string[];
  hasZip: boolean;
}

export function assertDownloadChildPath(downloadDirectory: string, input: string): string {
  const root = path.resolve(downloadDirectory);
  const target = path.resolve(input);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (target === root) throw new Error("请选择下载目录中的微信表情文件夹。");
    throw new Error("只能分享下载目录中的微信表情文件。");
  }
  return target;
}

export function buildWechatMobileSharePage(input: WechatMobileSharePageInput): string {
  const packageName = escapeHtml(input.packageName);
  const cards = input.stickerNames.map((fileName, index) => {
    const encodedName = encodeURIComponent(fileName);
    const imagePath = `stickers/${encodedName}`;
    return `
      <article class="sticker-card">
        <div class="sticker-stage">
          <span class="sticker-number" aria-hidden="true">${index + 1}</span>
          <img src="${imagePath}" alt="第 ${index + 1} 张微信表情" loading="${index < 4 ? "eager" : "lazy"}">
        </div>
        <div class="sticker-meta">
          <span>${escapeHtml(fileName)}</span>
        </div>
        <div class="sticker-actions">
          <button type="button" data-share="${imagePath}" data-name="${escapeHtmlAttribute(fileName)}">分享 / 保存</button>
          <a href="${imagePath}" target="_blank" rel="noopener" aria-label="打开第 ${index + 1} 张表情原图">原图</a>
        </div>
      </article>`;
  }).join("");
  const zipAction = input.hasZip
    ? `<a class="archive-link" href="package.zip">下载 ZIP 归档</a>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self';">
  <title>${packageName} · 微信表情导入</title>
  <style>
    :root { color: #151a17; background: #f4f6f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: max(24px, env(safe-area-inset-top)) 16px max(36px, env(safe-area-inset-bottom)); }
    main { width: min(100%, 760px); margin: 0 auto; }
    header { padding: 4px 2px 22px; }
    h1 { margin: 0; font-size: 23px; font-weight: 680; line-height: 1.3; text-wrap: balance; }
    .subtitle { margin: 7px 0 0; color: #59635d; font-size: 14px; line-height: 1.5; }
    .guide { margin-bottom: 24px; padding: 18px; border: 1px solid #d9dfdb; border-radius: 14px; background: #fff; }
    .guide strong { display: block; color: #151a17; font-size: 18px; line-height: 1.4; text-wrap: balance; }
    .guide-copy { margin: 6px 0 0; color: #4f5a53; font-size: 14px; line-height: 1.65; text-wrap: pretty; }
    .guide ol { display: grid; gap: 10px; margin: 16px 0 0; padding: 16px 0 0; border-top: 1px solid #e3e7e4; list-style: none; counter-reset: step; }
    .guide li { display: grid; grid-template-columns: 26px minmax(0, 1fr); align-items: start; gap: 10px; color: #2e3832; font-size: 14px; line-height: 1.6; counter-increment: step; }
    .guide li::before { content: counter(step); display: grid; place-items: center; width: 24px; height: 24px; margin-top: 1px; border-radius: 50%; color: #fff; background: #151a17; font-size: 12px; font-weight: 700; line-height: 1; }
    .notice { margin: 14px 0 0; color: #59635d; font-size: 14px; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 12px; }
    .sticker-card { min-width: 0; }
    .sticker-stage { position: relative; display: grid; place-items: center; aspect-ratio: 1; overflow: hidden; padding: 12px; border: 1px solid #d9dfdb; border-radius: 12px; background-color: #f8f9f8; background-image: linear-gradient(45deg,#ecefec 25%,transparent 25%),linear-gradient(-45deg,#ecefec 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ecefec 75%),linear-gradient(-45deg,transparent 75%,#ecefec 75%); background-size: 18px 18px; background-position: 0 0,0 9px,9px -9px,-9px 0; -webkit-touch-callout: default; }
    .sticker-stage img { display: block; width: 100%; height: 100%; object-fit: contain; image-rendering: auto; transition: transform 180ms cubic-bezier(.25,1,.5,1); }
    .sticker-stage:active img { transform: scale(.975); }
    .sticker-number { position: absolute; top: 8px; left: 8px; z-index: 1; display: grid; min-width: 24px; height: 24px; place-items: center; padding: 0 6px; border-radius: 999px; color: #fff; background: rgba(21, 26, 23, .78); font-size: 12px; font-weight: 700; line-height: 1; }
    .sticker-meta { min-width: 0; padding: 9px 2px 7px; color: #4f5a53; font-size: 14px; line-height: 1.4; }
    .sticker-meta span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sticker-actions { display: flex; gap: 6px; }
    button, .sticker-actions a, .archive-link { min-height: 44px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 650; text-align: center; text-decoration: none; transition: background-color 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out, transform 160ms cubic-bezier(.25,1,.5,1); }
    button { flex: 1; border: 0; color: #fff; background: #08783e; }
    button:hover { background: #066b37; }
    button:active, .sticker-actions a:active, .archive-link:active { transform: scale(.98); }
    button:focus-visible, .sticker-actions a:focus-visible, .archive-link:focus-visible { outline: 3px solid rgba(8, 120, 62, .3); outline-offset: 2px; }
    .sticker-actions a { display: grid; flex: 0 0 48px; place-items: center; border: 1px solid #d2d9d4; color: #344039; background: #fff; }
    .sticker-actions a:hover { border-color: #abb6ae; background: #f9faf9; }
    .archive { margin-top: 30px; padding: 20px 2px 0; border-top: 1px solid #d9dfdb; color: #59635d; font-size: 14px; line-height: 1.7; }
    .archive-link { display: grid; width: max-content; min-width: 148px; place-items: center; margin-top: 12px; padding: 0 14px; border: 1px solid #cbd3cd; color: #26312a; background: #fff; }
    .archive-link:hover { border-color: #aab5ad; background: #f9faf9; }
    .toast { position: fixed; left: 50%; bottom: max(24px, env(safe-area-inset-bottom)); z-index: 10; max-width: calc(100% - 40px); transform: translate(-50%, 16px); padding: 11px 15px; border-radius: 999px; color: #fff; background: rgba(20, 27, 23, .92); font-size: 14px; line-height: 1.5; opacity: 0; pointer-events: none; transition: transform 200ms cubic-bezier(.25,1,.5,1), opacity 160ms ease-out; }
    .toast.show { transform: translate(-50%, 0); opacity: 1; }
    @media (min-width: 620px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 360px) { .grid { grid-template-columns: 1fr; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
  </style>
</head>
<body>
  <main>
    <header><h1>${packageName}</h1><p class="subtitle">共 ${input.stickerNames.length} 张 · 微信兼容 GIF 文件</p></header>
    <section class="guide">
      <strong>长按图片，保存或分享</strong>
      <p class="guide-copy">在下方长按任一表情，即可使用微信或系统提供的图片菜单。</p>
      <ol>
        <li>长按表情图片，选择“保存图片”或“发送给朋友”。</li>
        <li>添加到微信时，前往“我 → 表情 → 设置 → 添加的单个表情”。</li>
        <li>点“+”，从系统相册选择刚保存的图片。</li>
      </ol>
      <p class="notice">如果没有出现长按菜单，可点图片下方的“分享 / 保存”。</p>
    </section>
    <section class="grid">${cards}</section>
    <section class="archive">ZIP 仅用于电脑归档或表情开放平台投稿，微信手机端不能把 ZIP 直接安装成表情包。${zipAction}</section>
  </main>
  <div class="toast" role="status" aria-live="polite"></div>
  <script>
    const toast = document.querySelector('.toast');
    function showToast(message) {
      toast.textContent = message;
      toast.classList.add('show');
      window.setTimeout(() => toast.classList.remove('show'), 2600);
    }
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-share]');
      if (!button) return;
      const source = button.dataset.share;
      const name = button.dataset.name;
      try {
        const response = await fetch(source, { cache: 'no-store' });
        if (!response.ok) throw new Error('download failed');
        const blob = await response.blob();
        const file = new File([blob], name, { type: blob.type || 'image/gif' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          await navigator.share({ files: [file], title: '保存微信表情' });
          return;
        }
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
      window.open(source, '_blank', 'noopener');
      showToast('已打开原图，请长按图片保存到系统相册');
    });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
