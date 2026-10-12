import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import type { ImageWorkbenchApi } from "../electron/preload/preload";
import { Button } from "@/components/ui/button";
import { ReferralInviteDialog } from "@/components/workbench/ReferralInviteDialog";
import "@/styles.css";

const previewApi = {
  getGiftActivationOverview: async () => ({
    campaign: {
      id: "default",
      name: "好友激活礼",
      enabled: true,
      redemptionEnabled: true,
      defaultQuota: 5,
      totalCodeLimit: 5_000,
      maxMajorVersion: 1,
      maxDevices: 2,
      activationCredits: 100,
      shareMessage: "送你一个 Iterlay 永久激活名额。下载安装后，填写自己的邮箱和下方激活码即可使用。",
      status: "active" as const,
      codesIssued: true,
      redemptionEndsAt: "2026-08-31T15:59:59.000Z"
    },
    eligible: true,
    totalQuota: 5,
    availableCount: 3,
    redeemedCount: 2,
    codes: [
      { id: "code-1", sequence: 1, code: "ITER-GIFT-7K3M-9Q2X", codePrefix: "ITER", status: "available" as const, shareCount: 2, createdAt: "2026-07-22T00:00:00.000Z" },
      { id: "code-2", sequence: 2, code: "ITER-GIFT-4N8P-6H1W", codePrefix: "ITER", status: "available" as const, shareCount: 0, createdAt: "2026-07-22T00:00:00.000Z" },
      { id: "code-3", sequence: 3, code: "", codePrefix: "ITER", status: "redeemed" as const, shareCount: 1, redeemedEmail: "li***@example.com", redeemedAt: "2026-07-22T06:30:00.000Z", createdAt: "2026-07-22T00:00:00.000Z" },
      { id: "code-4", sequence: 4, code: "ITER-GIFT-2D5R-8C7A", codePrefix: "ITER", status: "available" as const, shareCount: 0, createdAt: "2026-07-22T00:00:00.000Z" },
      { id: "code-5", sequence: 5, code: "", codePrefix: "ITER", status: "redeemed" as const, shareCount: 3, redeemedEmail: "wa***@example.com", redeemedAt: "2026-07-21T09:20:00.000Z", createdAt: "2026-07-22T00:00:00.000Z" }
    ]
  }),
  recordGiftActivationShare: async () => undefined,
  getReferralOverview: async () => ({
    invitationCode: "HEYU2026",
    invitationLink: "https://iterlay.daived.com:31243/download?ref=HEYU2026",
    rewardCredits: 200,
    totalInvited: 3,
    successfulCount: 2,
    totalRewards: 400,
    creditBalance: 1_260,
    items: []
  })
} as unknown as ImageWorkbenchApi;

(globalThis as typeof globalThis & { imageWorkbench: ImageWorkbenchApi }).imageWorkbench = previewApi;

function Preview(): React.ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <main className="min-h-screen bg-muted p-8 text-foreground">
      <Button onClick={() => setOpen(true)}>打开邀请弹窗</Button>
      <ReferralInviteDialog open={open} onOpenChange={setOpen} eligible onActivate={() => undefined} />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>
);
