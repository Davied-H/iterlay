performance.mark("iterlay:startup-shell-ready");

const developmentPreviewEntries = {
  "board-library-production": () => import("./dev-board-library-production-preview"),
  "board-card-concepts": () => import("./dev-board-card-concepts"),
  "sidebar-concepts": () => import("./dev-sidebar-concepts"),
  "provider-settings": () => import("./dev-provider-settings-preview"),
  "comic-drama": () => import("./dev-comic-drama-preview"),
  "video-generation": () => import("./dev-video-generation-preview"),
  "video-sequence": () => import("./dev-video-sequence-preview"),
  "referral-invite": () => import("./dev-referral-invite-preview"),
  "assistant-history": () => import("./dev-assistant-history-preview"),
  "creative-mode": () => import("./dev-creative-mode-preview"),
  "create-chat": () => import("./dev-create-chat-preview"),
  "template-extraction": () => import("./dev-template-extraction-preview"),
  "template-inspector-concepts": () => import("./dev-template-inspector-concepts"),
  "toast-concepts": () => import("./dev-toast-concepts"),
  "toast-system": () => import("./dev-toast-system-preview"),
  "toast-lab": () => import("./dev-toast-lab-preview"),
  "skill-upgrade": () => import("./dev-skill-upgrade-preview"),
  "image-preview": () => import("./dev-image-preview"),
  "template-assistant": () => import("./dev-template-assistant-preview"),
  "prompt-dock-edit": () => import("./dev-prompt-dock-edit-preview"),
  "prompt-dock-ui": () => import("./dev-prompt-dock-ui-preview"),
  "scene-detail": () => import("./dev-scene-detail-preview"),
  "scene-library": () => import("./dev-scene-library-preview"),
  "mastergo-reconstruction": () => import("./dev-mastergo-reconstruction-preview"),
  "feedback-manage": () => import("./dev-feedback-manage-preview")
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

function loadEntry(preview: string | null): Promise<unknown> {
  const previewEntry = preview ? developmentPreviewEntries[preview as keyof typeof developmentPreviewEntries] : undefined;
  if (import.meta.env.DEV && previewEntry) return previewEntry();
  return import("./bootstrap-react");
}

requestAnimationFrame(() => {
  const preview = new URLSearchParams(window.location.search).get("preview");
  void loadEntry(preview).catch(showBootstrapFailure);
});
