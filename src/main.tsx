performance.mark("iterlay:startup-shell-ready");

const developmentPreviewEntries = {
  "board-library-production": () => import("./dev/previews/board-library-production-preview"),
  "board-card-concepts": () => import("./dev/previews/board-card-concepts"),
  "sidebar-concepts": () => import("./dev/previews/sidebar-concepts"),
  "provider-settings": () => import("./dev/previews/provider-settings-preview"),
  "comic-drama": () => import("./dev/previews/comic-drama-preview"),
  "video-generation": () => import("./dev/previews/video-generation-preview"),
  "video-sequence": () => import("./dev/previews/video-sequence-preview"),
  "referral-invite": () => import("./dev/previews/referral-invite-preview"),
  "assistant-history": () => import("./dev/previews/assistant-history-preview"),
  "creative-mode": () => import("./dev/previews/creative-mode-preview"),
  "create-chat": () => import("./dev/previews/create-chat-preview"),
  "template-extraction": () => import("./dev/previews/template-extraction-preview"),
  "template-inspector-concepts": () => import("./dev/previews/template-inspector-concepts"),
  "toast-concepts": () => import("./dev/previews/toast-concepts"),
  "toast-system": () => import("./dev/previews/toast-system-preview"),
  "toast-lab": () => import("./dev/previews/toast-lab-preview"),
  "skill-upgrade": () => import("./dev/previews/skill-upgrade-preview"),
  "image-preview": () => import("./dev/previews/image-preview"),
  "template-assistant": () => import("./dev/previews/template-assistant-preview"),
  "prompt-dock-edit": () => import("./dev/previews/prompt-dock-edit-preview"),
  "prompt-dock-ui": () => import("./dev/previews/prompt-dock-ui-preview"),
  "scene-detail": () => import("./dev/previews/scene-detail-preview"),
  "scene-library": () => import("./dev/previews/scene-library-preview"),
  "mastergo-reconstruction": () => import("./dev/previews/mastergo-reconstruction-preview"),
  "feedback-manage": () => import("./dev/previews/feedback-manage-preview")
};

function showBootstrapFailure(error: unknown): void {
  const root = document.getElementById("root");
  if (!root) return;
  const message = document.createElement("p");
  message.className = "boot-error";
  const isChinese = (navigator.languages.length ? navigator.languages : [navigator.language])
    .some((language) => language.toLowerCase().startsWith("zh"));
  message.textContent = error instanceof Error
    ? error.message
    : isChinese
      ? "应用加载失败，请重新启动 Iterlay。"
      : "Iterlay failed to load. Please restart the app.";
  root.replaceChildren(message);
}

async function loadEntry(preview: string | null): Promise<unknown> {
  const previewEntry = preview ? developmentPreviewEntries[preview as keyof typeof developmentPreviewEntries] : undefined;
  if (import.meta.env.DEV && previewEntry) return previewEntry();
  if (import.meta.env.DEV) {
    const { initializeBrowserWorkbench } = await import("./lib/browser-workbench");
    await initializeBrowserWorkbench();
  }
  return import("./bootstrap-react");
}

requestAnimationFrame(() => {
  const params = new URLSearchParams(window.location.search);
  if (import.meta.env.DEV && params.get("__iterlay_backend") === "1") return;
  void loadEntry(params.get("preview")).catch(showBootstrapFailure);
});
