export interface OnlineImageSharePageInput {
  prompt: string;
  referenceCount: number;
  showPrompt: boolean;
  imageCount?: number;
}

export interface OnlineImageDetailSharePageInput {
  imageNumber: number;
  prompt: string;
  referenceCount: number;
}

export const ITERLAY_OFFICIAL_WEBSITE = "https://iterlay.app";
export const ITERLAY_SHARE_WEBSITE = "https://iterlay.app/";

export function buildOnlineImageSharePage(input: OnlineImageSharePageInput): string {
  const imageCount = Math.max(1, Math.min(24, Math.floor(input.imageCount ?? 1)));
  if (imageCount > 1) return buildOnlineImageCollectionSharePage(imageCount);
  const prompt = input.prompt.trim();
  const referenceCount = Math.max(0, Math.min(4, Math.floor(input.referenceCount)));
  const showPrompt = input.showPrompt && Boolean(prompt || referenceCount);
  const references = Array.from({ length: referenceCount }, (_, index) => `
            <figure class="reference">
              <a class="reference-preview" href="references/${index + 1}" target="_blank" rel="noopener" aria-label="预览参考图片 ${index + 1}">
                <img src="references/${index + 1}" alt="参考图片 ${index + 1}" loading="lazy">
              </a>
              <a class="reference-download" href="references/${index + 1}/download" download>下载</a>
            </figure>`).join("");
  const promptPanel = showPrompt
    ? `
        <aside class="prompt-panel">
          ${prompt ? `
          <section>
            <p class="section-label">创作提示词</p>
            <p class="prompt">${escapeHtml(prompt)}</p>
          </section>` : ""}
          ${referenceCount ? `
          <section class="references-section">
            <p class="section-label">参考图片 <span>${referenceCount}</span></p>
            <div class="references">${references}
            </div>
          </section>` : ""}
        </aside>`
    : "";
  const useInIterlay = showPrompt
    ? `<a id="use-in-iterlay" class="use-in-iterlay" href="iterlay://import">在 Iterlay 中使用</a>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Iterlay 图片分享</title>
  <style>
    :root { color: #181b19; background: #f2f3f1; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; padding: max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom)); }
    main { width: min(100%, 1180px); margin: 0 auto; }
    .brand-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 44px; margin-bottom: 18px; }
    .brand { display: inline-flex; min-width: 0; align-items: center; gap: 10px; color: #181b19; text-decoration: none; }
    .brand img { width: 34px; height: 34px; border-radius: 8px; box-shadow: 0 1px 2px rgba(19, 25, 21, .12); }
    .brand-name { font-size: 17px; font-weight: 720; line-height: 1; }
    .website { color: #59615c; font-size: 13px; line-height: 1.4; text-decoration: none; }
    .website:hover { color: #181b19; }
    .website:focus-visible, .original-link:focus-visible, .reference-preview:focus-visible, .reference-download:focus-visible, .brand:focus-visible { outline: 3px solid rgba(25, 112, 70, .25); outline-offset: 3px; border-radius: 4px; }
    .share-card { display: grid; grid-template-columns: minmax(0, 1fr) ${showPrompt ? "360px" : ""}; overflow: hidden; border: 1px solid #d9ddda; border-radius: 8px; background: #fff; box-shadow: 0 14px 38px rgba(23, 31, 26, .08); }
    .image-column { min-width: 0; }
    .image-stage { display: grid; min-height: min(74vh, 780px); place-items: center; padding: 24px; background-color: #eef0ee; background-image: linear-gradient(45deg,rgba(201,207,203,.34) 25%,transparent 25%),linear-gradient(-45deg,rgba(201,207,203,.34) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(201,207,203,.34) 75%),linear-gradient(-45deg,transparent 75%,rgba(201,207,203,.34) 75%); background-position: 0 0,0 10px,10px -10px,-10px 0; background-size: 20px 20px; }
    .image-stage img { display: block; width: 100%; height: 100%; max-height: min(74vh, 780px); object-fit: contain; }
    .image-meta { display: flex; min-height: 54px; align-items: center; justify-content: space-between; gap: 16px; padding: 0 18px; border-top: 1px solid #e2e5e3; }
    .image-meta span { color: #6a726d; font-size: 13px; line-height: 1.4; }
    .original-link { display: inline-flex; min-height: 36px; align-items: center; color: #176b45; font-size: 13px; font-weight: 680; text-decoration: none; white-space: nowrap; }
    .image-actions { display: inline-flex; align-items: center; gap: 14px; }
    .use-in-iterlay { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; padding: 0 12px; border: 1px solid #176b45; border-radius: 5px; background: #176b45; color: #fff; font-size: 13px; font-weight: 680; line-height: 1; text-decoration: none; white-space: nowrap; }
    .use-in-iterlay:hover { background: #105939; border-color: #105939; }
    .prompt-panel { min-width: 0; padding: 26px 24px; border-left: 1px solid #e2e5e3; }
    .prompt-panel section + section { margin-top: 30px; padding-top: 24px; border-top: 1px solid #e5e8e6; }
    .section-label { margin: 0 0 11px; color: #717974; font-size: 12px; font-weight: 680; line-height: 1.4; text-transform: uppercase; }
    .section-label span { margin-left: 4px; color: #9aa09c; font-weight: 600; }
    .prompt { margin: 0; color: #262b28; font-size: 15px; line-height: 1.75; overflow-wrap: anywhere; white-space: pre-wrap; }
    .references { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .reference { position: relative; aspect-ratio: 1; overflow: hidden; margin: 0; border: 1px solid #dde1de; border-radius: 6px; background: #f4f5f4; }
    .reference-preview { display: block; width: 100%; height: 100%; }
    .reference img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .18s ease; }
    .reference-preview:hover img { transform: scale(1.04); }
    .reference-download { position: absolute; right: 6px; bottom: 6px; min-height: 26px; padding: 0 8px; display: inline-flex; align-items: center; border-radius: 4px; background: rgba(24, 27, 25, .76); color: #fff; font-size: 11px; font-weight: 650; line-height: 1; text-decoration: none; opacity: 0; transition: opacity .18s ease, background-color .18s ease; }
    .reference:hover .reference-download, .reference:focus-within .reference-download { opacity: 1; }
    .reference-download:hover { background: rgba(16, 91, 57, .94); }
    footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 2px 0; color: #7a817d; font-size: 12px; line-height: 1.5; }
    @media (max-width: 720px) {
      body { padding-left: 12px; padding-right: 12px; }
      .brand-bar { margin: 0 4px 14px; }
      .website { font-size: 12px; }
      .share-card { grid-template-columns: minmax(0, 1fr); }
      .image-stage { min-height: 0; padding: 12px; }
      .image-stage img { height: auto; max-height: none; }
      .prompt-panel { padding: 22px 18px 26px; border-top: 1px solid #e2e5e3; border-left: 0; }
      .image-meta { min-height: 90px; flex-wrap: wrap; align-content: center; padding: 8px 14px; }
      .image-meta > span, .image-actions { width: 100%; }
      .image-actions { justify-content: space-between; gap: 10px; }
      .reference-download { opacity: 1; }
      footer { padding-left: 4px; padding-right: 4px; }
    }
    @media (max-width: 360px) {
      .brand-name { font-size: 16px; }
      .references { grid-template-columns: 1fr; }
      footer { align-items: flex-start; flex-direction: column; gap: 3px; }
    }
  </style>
</head>
<body>
  <main>
    <header class="brand-bar">
      <a class="brand" href="${ITERLAY_OFFICIAL_WEBSITE}">
        <img src="brand-logo" alt="Iterlay">
        <span class="brand-name">Iterlay</span>
      </a>
      <a class="website" href="${ITERLAY_OFFICIAL_WEBSITE}">iterlay.app</a>
    </header>
    <article class="share-card">
      <div class="image-column">
        <div class="image-stage"><img src="image" alt="分享图片"></div>
        <div class="image-meta">
          <span>由 Iterlay 创作</span>
          <div class="image-actions">
            ${useInIterlay}
            <a class="original-link" href="${ITERLAY_SHARE_WEBSITE}" target="_blank" rel="noopener">iterlay.app</a>
          </div>
        </div>
      </div>${promptPanel}
    </article>
    <footer>
      <span>Iterlay · AI 图像创作工作台</span>
      <span>${ITERLAY_OFFICIAL_WEBSITE}</span>
    </footer>
  </main>
  <script>
    const useInIterlay = document.getElementById("use-in-iterlay");
    useInIterlay?.addEventListener("click", (event) => {
      event.preventDefault();
      const source = new URL(window.location.href);
      source.hash = "";
      window.location.href = "iterlay://import?source=" + encodeURIComponent(source.href);
    });
  </script>
</body>
</html>`;
}

function buildOnlineImageCollectionSharePage(imageCount: number): string {
  const imageManifest = JSON.stringify(Array.from({ length: imageCount }, (_, index) => ({
    number: index + 1,
    src: `images/${index + 1}`,
    detailHref: `images/${index + 1}/detail`
  })));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <title>Iterlay 图片分享</title>
  <style>
    :root { color: #181b19; background: #f2f3f1; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; } body { min-height: 100vh; margin: 0; padding: max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom)); }
    main { width: min(100%, 1180px); margin: 0 auto; }.brand-bar, footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand-bar { min-height: 44px; margin-bottom: 18px; }.brand { display: inline-flex; align-items: center; gap: 10px; color: #181b19; text-decoration: none; }.brand img { width: 34px; height: 34px; border-radius: 8px; box-shadow: 0 1px 2px rgba(19,25,21,.12); }.brand-name { font-size: 17px; font-weight: 720; }.website { color: #59615c; font-size: 13px; text-decoration: none; }
    h1 { margin: 0 0 16px; font-size: 20px; line-height: 1.35; }.count { color: #6a726d; font-size: 14px; font-weight: 500; }
    .share-loading { display: flex; min-height: 76px; align-items: center; justify-content: center; gap: 10px; margin-bottom: 12px; border: 1px solid #dfe3df; border-radius: 8px; background: rgba(255,255,255,.65); color: #606963; font-size: 13px; }.share-loading[hidden] { display: none; }.share-spinner { width: 18px; height: 18px; border: 2px solid #d1d7d2; border-top-color: #176b45; border-radius: 50%; animation: spin .75s linear infinite; }.share-loading[data-complete="true"] .share-spinner { display: none; }.image-grid { position: relative; min-height: 0; }.image-card { position: absolute; overflow: hidden; border: 1px solid #d9ddda; border-radius: 8px; background: #fff; box-shadow: 0 4px 14px rgba(23,31,26,.05); animation: image-card-in .24s ease-out both; transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease; }.image-card:hover { border-color: rgba(24,27,25,.35); box-shadow: 0 12px 26px rgba(23,31,26,.13); }.image-preview { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; background: #eef0ee; }.image-preview img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .5s ease-out; }.image-card:hover img { transform: scale(1.025); }.image-overlay { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 14px; background: linear-gradient(180deg,rgba(12,19,15,0) 45%,rgba(12,19,15,.76)); color: #fff; font-size: 12px; opacity: 0; transition: opacity .2s ease; }.image-overlay strong { display: inline-flex; min-height: 30px; align-items: center; padding: 0 10px; border: 1px solid rgba(255,255,255,.13); border-radius: 5px; background: rgba(255,255,255,.13); font-size: 12px; }.image-card:hover .image-overlay, .image-card:focus-within .image-overlay { opacity: 1; }.image-card a:focus-visible, .brand:focus-visible { outline: 3px solid rgba(25,112,70,.32); outline-offset: -3px; } @keyframes spin { to { transform: rotate(360deg); } } @keyframes image-card-in { from { opacity: 0; } to { opacity: 1; } }
    footer { padding: 18px 2px 0; color: #7a817d; font-size: 12px; line-height: 1.5; } @media (hover: none) { .image-overlay { opacity: 1; } } @media (max-width: 520px) { body { padding-left: 12px; padding-right: 12px; }.website { font-size: 12px; } footer { align-items: flex-start; flex-direction: column; gap: 3px; } }
  </style>
</head>
<body><main>
  <header class="brand-bar"><a class="brand" href="${ITERLAY_OFFICIAL_WEBSITE}"><img src="brand-logo" alt="Iterlay"><span class="brand-name">Iterlay</span></a><a class="website" href="${ITERLAY_OFFICIAL_WEBSITE}">iterlay.app</a></header>
  <h1>图片分享 <span class="count">共 ${imageCount} 张</span></h1>
  <div class="share-loading" data-share-loading role="status"><span class="share-spinner" aria-hidden="true"></span><span data-share-loading-text>正在加载图片 · 已加载 0 / ${imageCount} 张</span></div>
  <section class="image-grid" data-share-masonry aria-label="分享图片"></section>
  <footer><span>Iterlay · AI 图像创作工作台</span><span>${ITERLAY_OFFICIAL_WEBSITE}</span></footer>
</main><script>
  const grid = document.querySelector("[data-share-masonry]");
  const loading = document.querySelector("[data-share-loading]");
  const loadingText = document.querySelector("[data-share-loading-text]");
  const images = ${imageManifest};
  const cards = [];
  let loadedCount = 0;
  function layoutMasonry() {
    const gap = 14;
    const targetWidth = 260;
    const columns = Math.max(2, Math.min(4, Math.round((grid.clientWidth + gap) / (targetWidth + gap))));
    const width = (grid.clientWidth - gap * (columns - 1)) / columns;
    const heights = Array(columns).fill(0);
    cards.forEach((card) => {
      const image = card.querySelector("img");
      const ratio = image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1;
      const column = heights.indexOf(Math.min(...heights));
      const height = width / ratio;
      card.style.width = width + "px";
      card.style.height = height + "px";
      card.style.transform = "translate3d(" + (column * (width + gap)) + "px," + heights[column] + "px,0)";
      heights[column] += height + gap;
    });
    grid.style.height = Math.max(0, Math.max(...heights) - gap) + "px";
  }
  function updateLoading() {
    loadingText.textContent = "正在加载图片 · 已加载 " + loadedCount + " / " + images.length + " 张";
  }
  function addCard(entry, image) {
    const card = document.createElement("article");
    card.className = "image-card";
    card.dataset.shareImage = String(entry.number);
    const link = document.createElement("a");
    link.className = "image-preview";
    link.href = entry.detailHref;
    link.setAttribute("aria-label", "查看图片 " + entry.number + " 详情");
    image.alt = "分享图片 " + entry.number;
    image.decoding = "async";
    const overlay = document.createElement("span");
    overlay.className = "image-overlay";
    overlay.innerHTML = "<span>图片 " + entry.number + "</span><strong>查看详情</strong>";
    link.append(image, overlay);
    card.append(link);
    grid.append(card);
    cards.push(card);
    layoutMasonry();
  }
  function preload(entry, attempt = 0) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        if (attempt < 1) window.setTimeout(() => resolve(preload(entry, attempt + 1)), 800);
        else resolve(null);
      };
      image.src = entry.src;
    });
  }
  async function loadImages() {
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < images.length) {
        const entry = images[nextIndex++];
        const image = await preload(entry);
        if (image) { loadedCount += 1; addCard(entry, image); }
        updateLoading();
      }
    }
    await Promise.all([worker(), worker()]);
    loading.dataset.complete = "true";
    loadingText.textContent = loadedCount === images.length
      ? "图片已加载完成"
      : loadedCount > 0 ? "已加载 " + loadedCount + " / " + images.length + " 张图片" : "暂时未能加载图片，请稍后刷新";
    if (loadedCount === images.length) window.setTimeout(() => { loading.hidden = true; }, 600);
  }
  window.addEventListener("resize", layoutMasonry); updateLoading(); void loadImages();
</script></body></html>`;
}

export function buildOnlineImageDetailSharePage(input: OnlineImageDetailSharePageInput): string {
  const number = Math.max(1, Math.floor(input.imageNumber));
  const prompt = input.prompt.trim();
  const referenceCount = Math.max(0, Math.min(4, Math.floor(input.referenceCount)));
  const references = Array.from({ length: referenceCount }, (_, index) => {
    const referenceNumber = index + 1;
    return `<a class="reference" href="../${number}/references/${referenceNumber}" target="_blank" rel="noopener"><img src="../${number}/references/${referenceNumber}" alt="参考图片 ${referenceNumber}" loading="lazy"></a>`;
  }).join("");
  const details = prompt || referenceCount
    ? `<section class="generation-details">${prompt ? `<p class="section-label">创作提示词</p><p class="prompt">${escapeHtml(prompt)}</p>` : ""}${referenceCount ? `<div class="reference-block"><p class="section-label">参考图片 <span>${referenceCount}</span></p><div class="references">${references}</div></div>` : ""}</section>`
    : `<p class="no-details">这张图片未附带生成信息。</p>`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="light"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline';"><title>图片 ${number} · Iterlay</title><style>
:root { color:#181b19; background:#f2f3f1; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; } * { box-sizing:border-box; } body { min-height:100vh; margin:0; padding:max(20px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom)); } main { width:min(100%,1180px); margin:0 auto; }.brand-bar { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:44px; margin-bottom:18px; }.brand { display:inline-flex; align-items:center; gap:10px; color:#181b19; text-decoration:none; }.brand img { width:34px; height:34px; border-radius:8px; }.brand-name { font-size:17px; font-weight:720; }.back { color:#59615c; font-size:13px; text-decoration:none; }.back:hover { color:#181b19; }.detail { display:grid; grid-template-columns:minmax(0,1fr) 360px; overflow:hidden; border:1px solid #d9ddda; border-radius:8px; background:#fff; box-shadow:0 14px 38px rgba(23,31,26,.08); }.image-stage { display:grid; min-height:min(74vh,780px); place-items:center; padding:24px; background:#eef0ee; }.image-stage img { display:block; width:100%; max-height:min(74vh,780px); object-fit:contain; }.detail-panel { min-width:0; padding:26px 24px; border-left:1px solid #e2e5e3; }.eyebrow,.section-label { margin:0; color:#717974; font-size:12px; font-weight:680; line-height:1.4; text-transform:uppercase; }.detail-panel h1 { margin:4px 0 0; font-size:22px; }.generation-details { margin-top:30px; }.prompt { margin:10px 0 0; color:#262b28; font-size:15px; line-height:1.75; white-space:pre-wrap; overflow-wrap:anywhere; }.reference-block { margin-top:26px; padding-top:22px; border-top:1px solid #e2e5e3; }.section-label span { color:#9aa09c; }.references { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }.reference { aspect-ratio:1; overflow:hidden; border:1px solid #dde1de; border-radius:6px; background:#f4f5f4; }.reference img { display:block; width:100%; height:100%; object-fit:cover; }.no-details { margin:30px 0; color:#6a726d; font-size:14px; line-height:1.6; }.download { display:inline-flex; min-height:38px; align-items:center; justify-content:center; margin-top:30px; padding:0 12px; border:1px solid #176b45; border-radius:5px; background:#176b45; color:#fff; font-size:13px; font-weight:680; text-decoration:none; }.brand:focus-visible,.back:focus-visible,.download:focus-visible { outline:3px solid rgba(25,112,70,.25); outline-offset:3px; border-radius:4px; } @media (max-width:720px) { body { padding-left:12px; padding-right:12px; }.detail { grid-template-columns:minmax(0,1fr); }.image-stage { min-height:0; padding:12px; }.image-stage img { max-height:none; }.detail-panel { padding:22px 18px 26px; border-top:1px solid #e2e5e3; border-left:0; } }
</style></head><body><main><header class="brand-bar"><a class="brand" href="../../"><img src="../../brand-logo" alt="Iterlay"><span class="brand-name">Iterlay</span></a><a class="back" href="../../">返回全部图片</a></header><article class="detail"><div class="image-stage"><img src="../${number}" alt="分享图片 ${number}"></div><section class="detail-panel"><p class="eyebrow">图片详情</p><h1>图片 ${number}</h1>${details}<a class="download" href="../${number}/download" download>下载原图</a></section></article></main></body></html>`;
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
