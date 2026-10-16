import { describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}));

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    send: electronMocks.send,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener
  }
}));

describe("imageWorkbench preload", () => {
  it("keeps media tool status, installation, cancellation and events separate", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    electronMocks.on.mockClear();
    electronMocks.removeListener.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      getMediaToolsState: () => Promise<unknown>;
      installMediaTools: () => Promise<unknown>;
      cancelMediaToolsDownload: () => Promise<void>;
      onMediaToolsState: (listener: (state: unknown) => void) => () => void;
    };
    await api.getMediaToolsState();
    expect(electronMocks.invoke.mock.calls).toEqual([["mediaTools:getState"]]);
    await api.installMediaTools();
    await api.cancelMediaToolsDownload();
    expect(electronMocks.invoke.mock.calls).toEqual([["mediaTools:getState"], ["mediaTools:install"], ["mediaTools:cancel"]]);
    const listener = vi.fn();
    const unsubscribe = api.onMediaToolsState(listener);
    const [channel, handler] = electronMocks.on.mock.calls[0];
    expect(channel).toBe("mediaTools:state");
    const state = { status: "downloading", transferredBytes: 5 };
    handler({}, state);
    expect(listener).toHaveBeenCalledWith(state);
    unsubscribe();
    expect(electronMocks.removeListener).toHaveBeenCalledWith(channel, handler);
  });

  it("opens only a registered inspiration source through IPC", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      openInspirationSource: (sourceId: string) => Promise<void>;
    };

    await api.openInspirationSource("aiart-pics");

    expect(electronMocks.invoke).toHaveBeenCalledWith("inspiration:open", "aiart-pics");
  });

  it("exposes the complete MasterGo reconstruction workflow", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      getMasterGoConnection: (force?: boolean) => Promise<unknown>;
      openMasterGoSetup: (target: "download" | "guide") => Promise<void>;
      prepareMasterGoReconstruction: (request: unknown) => Promise<unknown>;
      startMasterGoReconstruction: (request: unknown, textProviderId?: string) => Promise<unknown>;
      getMasterGoReconstructionTask: (id: string) => Promise<unknown>;
      cancelMasterGoReconstructionTask: (id: string) => Promise<unknown>;
    };
    const prepareRequest = { sourceName: "ui.png", frameName: "UI - 可编辑稿", mode: "ui" };
    const startRequest = {
      preparationId: "prepare-1",
      sourcePath: "/tmp/ui.png",
      sourceName: "ui.png",
      frameName: "UI - 可编辑稿",
      target: "current-page",
      strategy: "fidelity",
      mode: "ui"
    };
    electronMocks.invoke.mockResolvedValue({});

    await api.getMasterGoConnection(true);
    await api.openMasterGoSetup("guide");
    await api.prepareMasterGoReconstruction(prepareRequest);
    await api.startMasterGoReconstruction(startRequest, "text-provider-1");
    await api.getMasterGoReconstructionTask("task-1");
    await api.cancelMasterGoReconstructionTask("task-1");

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "mastergo:getConnection", true);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "mastergo:openSetup", "guide");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, "mastergo:prepareReconstruction", prepareRequest);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(
      4,
      "mastergo:startReconstruction",
      startRequest,
      "text-provider-1"
    );
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(5, "mastergo:getReconstructionTask", "task-1");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(6, "mastergo:cancelReconstructionTask", "task-1");
  });

  it("exposes Pi Agent log history, actions, and live events", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      getPiAgentLogs: () => Promise<unknown>;
      getPiAgentResources: () => Promise<unknown>;
      getPiAgentResourceDetail: (resourcePath: string) => Promise<unknown>;
      clearPiAgentLogs: () => Promise<unknown>;
      openPiAgentLogDirectory: () => Promise<unknown>;
      onPiAgentLog: (listener: (entry: unknown) => void) => () => void;
    };
    const listener = vi.fn();
    electronMocks.invoke.mockResolvedValue({});

    await api.getPiAgentLogs();
    await api.getPiAgentResources();
    await api.getPiAgentResourceDetail("/tmp/SKILL.md");
    await api.clearPiAgentLogs();
    await api.openPiAgentLogDirectory();
    const unsubscribe = api.onPiAgentLog(listener);
    const handler = electronMocks.on.mock.calls.at(-1)?.[1] as (event: unknown, entry: unknown) => void;
    const entry = { id: "log-1", event: "turn_start", summary: "开始第 1 轮判断" };
    handler({}, entry);
    unsubscribe();

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "pi-agent-log:list");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "pi-agent:resources:list");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, "pi-agent:resources:read", "/tmp/SKILL.md");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(4, "pi-agent-log:clear");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(5, "pi-agent-log:openDirectory");
    expect(listener).toHaveBeenCalledWith(entry);
    expect(electronMocks.removeListener).toHaveBeenCalledWith("pi-agent-log:event", handler);
  });

  it("exposes deep-link activation and subscriptions", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      activateDeepLinks: () => Promise<string[]>;
      onDeepLink: (listener: (url: string) => void) => () => void;
    };
    electronMocks.invoke.mockResolvedValueOnce(["iterlay://boards"]);
    const listener = vi.fn();

    await expect(api.activateDeepLinks()).resolves.toEqual(["iterlay://boards"]);
    const unsubscribe = api.onDeepLink(listener);
    const handler = electronMocks.on.mock.calls.at(-1)?.[1] as (event: unknown, url: string) => void;
    handler({}, "iterlay://assets");
    unsubscribe();

    expect(electronMocks.invoke).toHaveBeenCalledWith("deep-link:ready");
    expect(listener).toHaveBeenCalledWith("iterlay://assets");
    expect(electronMocks.removeListener).toHaveBeenCalledWith("deep-link:open", handler);
  });

  it("exposes atomic settings updates", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      updateSettings: (patch: unknown) => Promise<unknown>;
    };
    const patch = { wechatStickerExportEnabled: true };
    electronMocks.invoke.mockResolvedValueOnce({ ok: true });

    await api.updateSettings(patch);

    expect(electronMocks.invoke).toHaveBeenCalledWith("settings:update", patch);
  });

  it("exposes atomic board image arrangement operations", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      resizeBoardImage: (boardId: string, nodeId: string, width: number) => Promise<unknown>;
      arrangeBoardImages: (boardId: string, nodeIds: string[], mode: "grid", gap: number) => Promise<unknown>;
      duplicateBoardImages: (boardId: string, nodeIds: string[], offset: number) => Promise<unknown>;
      setBoardImageVersion: (boardId: string, nodeId: string, versionIndex: number) => Promise<unknown>;
    };
    electronMocks.invoke.mockResolvedValue({});

    await api.resizeBoardImage("board", "image-a", 360);
    await api.arrangeBoardImages("board", ["image-a", "image-b"], "grid", 40);
    await api.duplicateBoardImages("board", ["image-a"], 24);
    await api.setBoardImageVersion("board", "image-a", 0);

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "boards:images:resize", "board", "image-a", 360);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "boards:images:arrange", "board", ["image-a", "image-b"], "grid", 40);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, "boards:images:duplicate", "board", ["image-a"], 24);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(4, "boards:images:setVersion", "board", "image-a", 0);
  });

  it("exposes comic drama snapshot and atomic mutation plan channels", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      getComicDramaBoardSnapshot: (boardId: string) => Promise<unknown>;
      applyComicDramaMutationPlan: (plan: unknown) => Promise<unknown>;
    };
    const plan = { planId: "plan-1", boardId: "board-1", baseRevision: 3 };
    electronMocks.invoke.mockResolvedValue({});

    await api.getComicDramaBoardSnapshot("board-1");
    await api.applyComicDramaMutationPlan(plan);

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "comicDrama:getBoardSnapshot", "board-1");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "comicDrama:applyMutationPlan", plan);
  });

  it("exposes CLI Skill setup without a public MCP surface", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      installAgentSkill: (client: string) => Promise<unknown>;
      removeAgentSkill: (client: string) => Promise<unknown>;
      consumeAgentSkillUpgrades: () => Promise<unknown>;
      configureMcpClient?: unknown;
    };
    expect(api.configureMcpClient).toBeUndefined();
    electronMocks.invoke.mockResolvedValueOnce({ clients: [] });
    await expect(api.installAgentSkill("codex")).resolves.toEqual({ clients: [] });
    expect(electronMocks.invoke).toHaveBeenCalledWith("agent:skill:install", "codex");
    await api.removeAgentSkill("codex");
    expect(electronMocks.invoke).toHaveBeenCalledWith("agent:skill:remove", "codex");
    await api.consumeAgentSkillUpgrades();
    expect(electronMocks.invoke).toHaveBeenCalledWith("agent:skill-upgrade:consume");
  });

  it("exposes the app cache clearing channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      clearAppCache: () => Promise<unknown>;
    };
    electronMocks.invoke.mockResolvedValueOnce({ ok: true });

    await expect(api.clearAppCache()).resolves.toEqual({ ok: true });

    expect(electronMocks.invoke).toHaveBeenCalledWith("app:clearCache");
  });

  it("exposes template submission and review status channels", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      submitSceneTemplate: (scene: unknown, authorName: string, exampleResultIds: string[]) => Promise<unknown>;
      getSceneTemplateSubmission: (sourceTemplateId: string) => Promise<unknown>;
    };
    const scene = { id: "custom:test", source: "custom" };
    const submission = {
      id: "submission-id",
      slug: "template-submission",
      name: "测试模板",
      authorName: "Dong",
      status: "pending",
      submittedAt: "2026-07-24T00:00:00Z"
    };
    electronMocks.invoke.mockResolvedValue(submission);

    await expect(api.submitSceneTemplate(scene, "Dong", ["example-1"])).resolves.toBe(submission);
    await expect(api.getSceneTemplateSubmission("custom:test")).resolves.toBe(submission);

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "scenes:submitTemplate", scene, "Dong", ["example-1"]);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "scenes:getTemplateSubmission", "custom:test");
  });

  it("exposes system notification diagnostics", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      testSystemNotification: () => Promise<unknown>;
      openSystemNotificationSettings: () => Promise<unknown>;
    };
    electronMocks.invoke
      .mockResolvedValueOnce({ status: "delivered" })
      .mockResolvedValueOnce({ ok: true });

    await expect(api.testSystemNotification()).resolves.toEqual({ status: "delivered" });
    await expect(api.openSystemNotificationSettings()).resolves.toEqual({ ok: true });

    expect(electronMocks.invoke).toHaveBeenCalledWith("notification:test");
    expect(electronMocks.invoke).toHaveBeenCalledWith("notification:openSettings");
  });

  it("exposes generation-notification navigation events", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      onGenerationNotificationOpen: (listener: (target: unknown) => void) => () => void;
    };
    const listener = vi.fn();

    const unsubscribe = api.onGenerationNotificationOpen(listener);
    const handler = electronMocks.on.mock.calls.at(-1)?.[1] as (event: unknown, target: unknown) => void;
    const target = { boardId: "board-1", imagePaths: ["/assets/result.png"] };
    handler({}, target);
    unsubscribe();

    expect(listener).toHaveBeenCalledWith(target);
    expect(electronMocks.removeListener).toHaveBeenCalledWith("notification:generation:open", handler);
  });

  it("exposes durable onboarding state channels", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      getOnboardingState: (legacyState: unknown) => Promise<unknown>;
      markOnboardingSeen: (key: string, status: string) => Promise<unknown>;
      clearOnboardingSeen: (key: string) => Promise<unknown>;
    };
    const state = {
      "iterlay.onboarding.board.v1": { status: "completed", at: "2026-07-20T08:00:00.000Z" }
    };
    electronMocks.invoke.mockResolvedValue(state);

    await api.getOnboardingState(state);
    await api.markOnboardingSeen("iterlay.onboarding.board.v1", "completed");
    await api.clearOnboardingSeen("iterlay.onboarding.board.v1");

    expect(electronMocks.invoke).toHaveBeenCalledWith("onboarding:get", state);
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "onboarding:mark",
      "iterlay.onboarding.board.v1",
      "completed"
    );
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "onboarding:clear",
      "iterlay.onboarding.board.v1"
    );
  });

  it("exposes the official credit status channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      getCreditStatus: () => Promise<unknown>;
    };
    const status = { credits: { balance: 100 }, providerAvailable: true };
    electronMocks.invoke.mockResolvedValueOnce(status);

    await expect(api.getCreditStatus()).resolves.toBe(status);
    expect(electronMocks.invoke).toHaveBeenCalledWith("credits:getStatus");
  });

  it("exposes the referral overview channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      getReferralOverview: () => Promise<unknown>;
    };
    const overview = { invitationCode: "HEYU2026", invitationLink: "https://example.com/download?ref=HEYU2026" };
    electronMocks.invoke.mockResolvedValueOnce(overview);

    await expect(api.getReferralOverview()).resolves.toBe(overview);
    expect(electronMocks.invoke).toHaveBeenCalledWith("referrals:getOverview");
  });

  it("exposes feedback submission through the dedicated channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      submitFeedback: (request: unknown) => Promise<unknown>;
    };
    const request = {
      kind: "feature",
      content: "希望支持批量导出",
      pageContext: { view: "board", route: "/", viewport: "1280x840", locale: "zh-CN" }
    };
    const result = { id: "feedback-1", status: "pending", createdAt: "2026-08-04T08:00:00Z" };
    electronMocks.invoke.mockResolvedValueOnce(result);

    await expect(api.submitFeedback(request)).resolves.toBe(result);
    expect(electronMocks.invoke).toHaveBeenCalledWith("feedback:submit", request);
  });

  it("exposes feedback history and detail through dedicated channels", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      listFeedbackHistory: (limit?: number) => Promise<unknown>;
      getFeedbackDetail: (feedbackId: string) => Promise<unknown>;
    };
    const page = { items: [], total: 0, limit: 50, offset: 0 };
    const detail = { id: "feedback-1" };
    electronMocks.invoke.mockResolvedValueOnce(page).mockResolvedValueOnce(detail);

    await expect(api.listFeedbackHistory(50)).resolves.toBe(page);
    await expect(api.getFeedbackDetail("feedback-1")).resolves.toBe(detail);
    expect(electronMocks.invoke).toHaveBeenCalledWith("feedback:listHistory", 50);
    expect(electronMocks.invoke).toHaveBeenCalledWith("feedback:getDetail", "feedback-1");
  });

  it("exposes gift activation overview and share channels", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      getGiftActivationOverview: () => Promise<unknown>;
      recordGiftActivationShare: (codeId: string) => Promise<void>;
    };
    const overview = { eligible: true, totalQuota: 5, codes: [] };
    electronMocks.invoke.mockResolvedValueOnce(overview).mockResolvedValueOnce(undefined);

    await expect(api.getGiftActivationOverview()).resolves.toBe(overview);
    await api.recordGiftActivationShare("code-1");

    expect(electronMocks.invoke).toHaveBeenCalledWith("giftActivations:getOverview");
    expect(electronMocks.invoke).toHaveBeenCalledWith("giftActivations:recordShare", "code-1");
  });

  it("opens the authenticated customer portal through the license channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      openLicensePortal: () => Promise<void>;
    };
    electronMocks.invoke.mockResolvedValueOnce(undefined);

    await api.openLicensePortal();

    expect(electronMocks.invoke).toHaveBeenCalledWith("license:openPortal");
  });

  it("exposes scene collaboration through the scene:collaborate channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      collaborateScene: (request: unknown) => Promise<unknown>;
    };
    const request = {
      instruction: "创建一张商品海报",
      referenceImages: [],
      currentFields: [],
      workflowMode: "generate"
    };
    const response = { message: "已完成", fields: [{ label: "主体", value: "香水瓶" }] };
    electronMocks.invoke.mockResolvedValueOnce(response);

    await expect(api.collaborateScene(request)).resolves.toBe(response);
    expect(electronMocks.invoke).toHaveBeenCalledWith("scene:collaborate", request);
  });

  it("exposes cancellable scene collaboration stream events", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      startSceneCollaboration: (requestId: string, request: unknown) => void;
      cancelSceneCollaboration: (requestId: string) => void;
      onSceneCollaborationEvent: (listener: (event: unknown) => void) => () => void;
    };
    const listener = vi.fn();
    const unsubscribe = api.onSceneCollaborationEvent(listener);
    const request = { instruction: "创建海报" };

    api.startSceneCollaboration("request-1", request);
    api.cancelSceneCollaboration("request-1");
    const handler = electronMocks.on.mock.calls.at(-1)?.[1] as ((event: unknown, payload: unknown) => void);
    handler({}, { requestId: "request-1", type: "delta", delta: "正在" });
    unsubscribe();

    expect(electronMocks.send).toHaveBeenCalledWith("scene:collaborate:start", {
      requestId: "request-1",
      request
    });
    expect(electronMocks.send).toHaveBeenCalledWith("scene:collaborate:cancel", "request-1");
    expect(listener).toHaveBeenCalledWith({ requestId: "request-1", type: "delta", delta: "正在" });
    expect(electronMocks.removeListener).toHaveBeenCalledWith("scene:collaborate:event", handler);
  });

  it("exposes the dedicated assistant intent suggestion channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      suggestAssistantIntents: (request: unknown) => Promise<unknown>;
    };
    const request = {
      assistantSurface: "canvas-prompt",
      conversation: [],
      currentFields: []
    };
    const response = { suggestions: ["创建一个新画面", "完善当前提示词", "尝试不同风格"] };
    electronMocks.invoke.mockResolvedValueOnce(response);

    await expect(api.suggestAssistantIntents(request)).resolves.toBe(response);
    expect(electronMocks.invoke).toHaveBeenCalledWith("assistant:suggestIntents", request);
  });

  it("exposes app icon switching through the appIcon:set channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      setAppIcon: (appIcon: "default" | "mascot") => Promise<unknown>;
    };
    const response = { ok: true, appIcon: "mascot" };
    electronMocks.invoke.mockResolvedValueOnce(response);

    await expect(api.setAppIcon("mascot")).resolves.toBe(response);
    expect(electronMocks.invoke).toHaveBeenCalledWith("appIcon:set", "mascot");
  });

  it("exposes custom app icon upload and deletion channels", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      uploadAppIcon: (request: unknown) => Promise<unknown>;
      deleteAppIcon: (id: string) => Promise<unknown>;
    };
    const request = { name: "portrait.png", dataUrl: "data:image/png;base64,AAAA" };
    const library = {
      appIcon: "custom:portrait-1",
      customAppIcons: [{ id: "portrait-1", name: "portrait.png", dataUrl: request.dataUrl }]
    };
    electronMocks.invoke.mockResolvedValue(library);

    await expect(api.uploadAppIcon(request)).resolves.toBe(library);
    await expect(api.deleteAppIcon("portrait-1")).resolves.toBe(library);

    expect(electronMocks.invoke).toHaveBeenCalledWith("appIcon:upload", request);
    expect(electronMocks.invoke).toHaveBeenCalledWith("appIcon:delete", "portrait-1");
  });

  it("opens a downloaded file through the downloads:openPath channel", async () => {
    await import("../electron/preload/preload.js");
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      openDownloadedPath: (targetPath: string) => Promise<unknown>;
    };
    const response = { ok: true };
    electronMocks.invoke.mockResolvedValueOnce(response);

    await expect(api.openDownloadedPath("/Users/dong/Downloads/image.png")).resolves.toBe(response);
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "downloads:openPath",
      "/Users/dong/Downloads/image.png"
    );
  });

  it("exposes WeChat package saving and mobile import sharing", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      saveWechatStickerPackage: (request: unknown) => Promise<unknown>;
      shareWechatStickerPackage: (folderPath: string, zipPath?: string, origin?: unknown) => Promise<unknown>;
      stopSharingDownloadedPath: () => Promise<unknown>;
    };
    const request = { packageName: "微信表情", createZip: true, files: [] };
    const origin = { boardId: "board-1", nodeIds: ["node-1", "node-2"] };
    const saveResult = { ok: true, folderPath: "/Users/test/Downloads/stickers" };
    const shareResult = { ok: true, url: "http://192.168.1.2:3000/token", expiresAt: 123 };
    const stopResult = { ok: true };
    electronMocks.invoke
      .mockResolvedValueOnce(saveResult)
      .mockResolvedValueOnce(shareResult)
      .mockResolvedValueOnce(stopResult);

    await expect(api.saveWechatStickerPackage(request)).resolves.toBe(saveResult);
    await expect(api.shareWechatStickerPackage(
      "/Users/test/Downloads/stickers",
      "/Users/test/Downloads/stickers.zip",
      origin
    ))
      .resolves.toBe(shareResult);
    await expect(api.stopSharingDownloadedPath()).resolves.toBe(stopResult);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "asset:saveWechatStickerPackage", request);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "downloads:shareWechatPackage", {
      folderPath: "/Users/test/Downloads/stickers",
      zipPath: "/Users/test/Downloads/stickers.zip",
      origin
    });
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, "downloads:stopSharing");
  });

  it("exposes online image sharing and active-session management", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      startOnlineImageShare: (request: unknown) => Promise<unknown>;
      getActiveOnlineShare: () => Promise<unknown>;
      stopOnlineShare: () => Promise<unknown>;
    };
    const request = {
      sourcePath: "/workspace/image.png",
      jobId: "job-1",
      showPrompt: true,
      origin: {
        boardId: "board-1",
        nodeIds: ["node-1"]
      }
    };
    const session = {
      id: "share-1",
      kind: "image",
      title: "image.png",
      url: "https://share.example.com/share-1",
      startedAt: 1,
      expiresAt: 2,
      origin: request.origin
    };
    electronMocks.invoke
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ok: true });

    await expect(api.startOnlineImageShare(request)).resolves.toBe(session);
    await expect(api.getActiveOnlineShare()).resolves.toBe(session);
    await expect(api.stopOnlineShare()).resolves.toEqual({ ok: true });

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, "sharing:startImage", request);
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, "sharing:getActive");
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, "sharing:stop");
  });

  it("exposes native GIF clipboard writing", async () => {
    await import("../electron/preload/preload.js");
    electronMocks.invoke.mockClear();
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1] as {
      writeClipboardImage: (request: unknown) => Promise<unknown>;
    };
    const request = { mimeType: "image/gif", bytes: new ArrayBuffer(8) };
    const result = { ok: true };
    electronMocks.invoke.mockResolvedValueOnce(result);

    await expect(api.writeClipboardImage(request)).resolves.toBe(result);
    expect(electronMocks.invoke).toHaveBeenCalledWith("clipboard:writeImage", request);
  });
});
