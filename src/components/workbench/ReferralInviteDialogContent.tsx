import { useUiText } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift, KeyRound, Loader2, RefreshCw, Users } from "lucide-react";
import type { GiftActivationCode, GiftActivationOverview, ReferralOverview } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

export interface ReferralInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eligible: boolean;
  onActivate: () => void;
}

type InviteTab = "gift" | "credits";

export function ReferralInviteDialogContent({
  open,
  onOpenChange,
  eligible,
  onActivate
}: ReferralInviteDialogProps): React.ReactElement {
  const uiText = useUiText();

  const [tab, setTab] = useState<InviteTab>("gift");
  const [referral, setReferral] = useState<ReferralOverview | null>(null);
  const [giftOverview, setGiftOverview] = useState<GiftActivationOverview | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [giftLoading, setGiftLoading] = useState(false);
  const [referralRequested, setReferralRequested] = useState(false);
  const [giftRequested, setGiftRequested] = useState(false);
  const [referralError, setReferralError] = useState("");
  const [giftError, setGiftError] = useState("");
  const [copiedKey, setCopiedKey] = useState("");

  const loadReferral = useCallback(async (): Promise<void> => {
    if (!eligible) return;
    setReferralRequested(true);
    setReferralLoading(true);
    setReferralError("");
    try {
      setReferral(await getImageWorkbenchApi().getReferralOverview());
    } catch (requestError) {
      setReferralError(getWorkbenchErrorMessage(requestError, "暂时无法读取邀请信息。"));
    } finally {
      setReferralLoading(false);
    }
  }, [eligible]);

  const loadGiftOverview = useCallback(async (): Promise<void> => {
    if (!eligible) return;
    setGiftRequested(true);
    setGiftLoading(true);
    setGiftError("");
    try {
      setGiftOverview(await getImageWorkbenchApi().getGiftActivationOverview());
    } catch (requestError) {
      setGiftError(getWorkbenchErrorMessage(requestError, "暂时无法读取好友激活礼。"));
    } finally {
      setGiftLoading(false);
    }
  }, [eligible]);

  useEffect(() => {
    if (!open || !eligible) return;
    if (tab === "gift" && !giftRequested) void loadGiftOverview();
    if (tab === "credits" && !referralRequested) void loadReferral();
  }, [eligible, giftRequested, loadGiftOverview, loadReferral, open, referralRequested, tab]);

  useEffect(() => {
    if (open) return;
    setCopiedKey("");
    setGiftError("");
    setReferralError("");
    setGiftRequested(false);
    setReferralRequested(false);
  }, [open]);

  async function copy(value: string, key: string): Promise<void> {
    try {
      await writeClipboardText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? "" : current), 1_800);
    } catch {
      const message = "复制失败，请选择内容后手动复制。";
      if (tab === "gift") setGiftError(message);
      else setReferralError(message);
    }
  }

  async function copyGiftCode(code: GiftActivationCode): Promise<void> {
    if (!giftOverview || !code.code) return;
    await copy(buildGiftShareText(giftOverview, code), `gift-${code.id}`);
    void getImageWorkbenchApi().recordGiftActivationShare(code.id).catch(() => undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[max(1rem,10vh)] w-[calc(100vw-2rem)] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0"
        onKeyDownCapture={(event) => event.stopPropagation()}
      >
        <Tabs value={tab} onValueChange={(value) => setTab(value as InviteTab)}>
          <DialogHeader className="gap-2 border-b border-border px-5 py-3 pr-12 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--favorite)/0.12)] text-[hsl(var(--favorite))]">
                <Gift className="h-4 w-4" aria-hidden="true" />
              </span>
              <DialogTitle className="shrink-0">{uiText("邀请好友")}</DialogTitle>
              <DialogDescription className="sr-only">
                {uiText("分享永久授权给好友，或邀请购买赚取 Credit。")}</DialogDescription>
            </div>
            {eligible ? (
              <TabsList className="grid h-8 w-full shrink-0 grid-cols-2 sm:w-72">
                <TabsTrigger value="gift" className="h-6 px-2 text-xs"><KeyRound className="h-3.5 w-3.5" />{uiText("好友激活礼")}</TabsTrigger>
                <TabsTrigger value="credits" className="h-6 px-2 text-xs"><Users className="h-3.5 w-3.5" />{uiText("邀请赚 Credit")}</TabsTrigger>
              </TabsList>
            ) : null}
          </DialogHeader>

          {!eligible ? (
            <ActivationRequired onActivate={() => { onOpenChange(false); onActivate(); }} />
          ) : (
            <>
            <TabsContent value="gift" className="m-0">
              <GiftActivationContent
                overview={giftOverview}
                loading={giftLoading}
                error={giftError}
                copiedKey={copiedKey}
                onRetry={() => void loadGiftOverview()}
                onCopy={(code) => void copyGiftCode(code)}
              />
            </TabsContent>
            <TabsContent value="credits" className="m-0">
              <CreditReferralContent
                overview={referral}
                loading={referralLoading}
                error={referralError}
                copied={copiedKey === "referral"}
                onRetry={() => void loadReferral()}
                onCopy={() => { if (referral) void copy(referral.invitationLink, "referral"); }}
              />
            </TabsContent>
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ActivationRequired({ onActivate }: { onActivate: () => void }): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="px-6 py-6">
      <p className="text-sm font-medium">{uiText("激活授权后即可参与邀请活动")}</p>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        {uiText("激活后可查看好友激活码，并生成你的专属购买邀请链接。")}</p>
      <Button className="mt-5 w-full" onClick={onActivate}>{uiText("激活授权")}</Button>
    </div>
  );
}

function GiftActivationContent({
  overview,
  loading,
  error,
  copiedKey,
  onRetry,
  onCopy
}: {
  overview: GiftActivationOverview | null;
  loading: boolean;
  error: string;
  copiedKey: string;
  onRetry: () => void;
  onCopy: (code: GiftActivationCode) => void;
}): React.ReactElement {
  const uiText = useUiText();

  if (loading && !overview) return <LoadingState label={uiText("正在读取好友激活码")} />;
  if (!overview) return <ErrorState title={uiText("好友激活礼加载失败")} message={error} onRetry={onRetry} />;

  const campaignOpen = overview.campaign.status === "active" || overview.campaign.status === "redeeming";
  const status = giftCampaignLabel(overview.campaign.status);

  if (!overview.eligible) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
        <KeyRound className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium">{uiText("当前授权不参与本次活动")}</p>
        <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">
          {overview.eligibilityReason || "好友激活礼仅面向符合活动条件的付费授权。"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 py-4 text-xs">
        <Badge variant={campaignOpen ? "secondary" : "muted"}>{status}</Badge>
        <span className="font-medium text-foreground">
          Iterlay {overview.campaign.maxMajorVersion}{uiText(".x 永久授权 · ")}{overview.campaign.maxDevices} {uiText("台设备")}</span>
        <span className="text-muted-foreground">
          {uiText("待领取 ")}{overview.availableCount} / {overview.totalQuota}
        </span>
        {overview.campaign.redemptionEndsAt ? (
          <span className="ml-auto text-muted-foreground">{uiText("兑换至 ")}{formatDate(overview.campaign.redemptionEndsAt)}</span>
        ) : null}
      </div>

      {error ? <p className="border-b border-border px-6 py-2 text-xs text-destructive" role="alert">{error}</p> : null}

      <div className="h-[23.75rem] max-h-[48vh] overflow-y-auto">
        {overview.codes.length ? [...overview.codes]
          .sort((left, right) => {
            const leftIsAvailable = left.status === "available";
            const rightIsAvailable = right.status === "available";
            if (leftIsAvailable !== rightIsAvailable) return leftIsAvailable ? -1 : 1;
            return left.sequence - right.sequence;
          })
          .map((code) => (
          <GiftCodeRow
            key={code.id}
            code={code}
            campaignOpen={campaignOpen}
            copied={copiedKey === `gift-${code.id}`}
            onCopy={() => onCopy(code)}
          />
          )) : (
          <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium">{uiText("暂时没有可分享的激活码")}</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{uiText("活动开始发码后，名额会自动显示在这里。")}</p>
          </div>
        )}
      </div>

      <p className="border-t border-border px-6 py-3 text-xs leading-5 text-muted-foreground">
        {uiText("每个激活码仅限一位好友领取。好友使用尚未拥有正式授权的邮箱和此码激活即可绑定。")}</p>
    </div>
  );
}

function GiftCodeRow({
  code,
  campaignOpen,
  copied,
  onCopy
}: {
  code: GiftActivationCode;
  campaignOpen: boolean;
  copied: boolean;
  onCopy: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  const available = code.status === "available" && campaignOpen && Boolean(code.code);
  const state = code.status === "redeemed"
    ? "已领取"
    : code.status === "expired"
      ? "已过期"
      : campaignOpen
        ? "待领取"
        : "暂不可用";

  return (
    <div className="flex min-h-[4.75rem] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:gap-4 sm:px-6">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium tabular-nums text-muted-foreground">
        {code.sequence}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <code className="truncate font-mono text-sm font-semibold tracking-[0.06em]" title={code.code || code.codePrefix}>
            {code.code || `${code.codePrefix}••••••••`}
          </code>
          <Badge variant={code.status === "redeemed" ? "outline" : available ? "secondary" : "muted"}>{state}</Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {code.status === "redeemed"
            ? `${code.redeemedEmail || "好友邮箱"}${code.redeemedAt ? ` · ${formatDate(code.redeemedAt)}` : ""}`
            : code.shareCount > 0
              ? uiText("已复制分享 {{ui:0}} 次", [code.shareCount])
              : uiText("尚未分享")}
        </p>
      </div>
      <Button
        size="sm"
        className="w-9 shrink-0 px-0 sm:w-[6.75rem] sm:px-3"
        disabled={!available}
        aria-label={copied ? uiText("邀请文案已复制") : uiText("复制第 {{ui:0}} 个激活码邀请", [code.sequence])}
        onClick={onCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{copied ? uiText("已复制") : uiText("复制邀请")}</span>
      </Button>
    </div>
  );
}

function CreditReferralContent({
  overview,
  loading,
  error,
  copied,
  onRetry,
  onCopy
}: {
  overview: ReferralOverview | null;
  loading: boolean;
  error: string;
  copied: boolean;
  onRetry: () => void;
  onCopy: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  if (loading && !overview) return <LoadingState label={uiText("正在读取邀请信息")} />;
  if (!overview) return <ErrorState title={uiText("邀请信息加载失败")} message={error} onRetry={onRetry} />;

  return (
    <div>
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border px-2 py-4">
        <ReferralMetric label={uiText("每次奖励")} value={`${overview.rewardCredits}`} suffix="Credit" />
        <ReferralMetric label={uiText("已邀请")} value={`${overview.totalInvited}`} suffix="人" />
        <ReferralMetric label={uiText("已到账")} value={`${overview.totalRewards}`} suffix="Credit" />
      </div>
      <div className="px-6 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{uiText("你的邀请码")}</p>
            <p className="mt-1 font-mono text-xl font-semibold tracking-[0.08em]">{overview.invitationCode}</p>
          </div>
          <span className="flex items-center gap-1.5 pb-0.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />{overview.successfulCount} {uiText("人已完成购买")}</span>
        </div>
        <label className="mt-5 block text-xs font-medium" htmlFor="referral-invitation-link">{uiText("邀请链接")}</label>
        <div className="mt-2 flex min-w-0 gap-2">
          <input
            id="referral-invitation-link"
            readOnly
            value={overview.invitationLink}
            onFocus={(event) => event.currentTarget.select()}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button className="w-[7.25rem] shrink-0" onClick={onCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? uiText("已复制") : uiText("复制链接")}
          </Button>
        </div>
        {error ? <p className="mt-2 text-xs text-destructive" role="alert">{error}</p> : null}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{uiText("好友从链接进入下载页，购买时会自动关联你的邀请码。")}</p>
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin [animation-duration:750ms]" aria-hidden="true" />{label}
    </div>
  );
}

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">{message || "请稍后重试。"}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />{uiText("重新加载")}</Button>
    </div>
  );
}

function ReferralMetric({ label, value, suffix }: { label: string; value: string; suffix: string }): React.ReactElement {
  return (
    <div className="min-w-0 px-3 text-center">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums" title={`${value} ${suffix}`}>
        {value} <span className="text-[10px] font-normal text-muted-foreground">{suffix}</span>
      </p>
    </div>
  );
}

function buildGiftShareText(overview: GiftActivationOverview, code: GiftActivationCode): string {
  const lines = [
    overview.campaign.shareMessage.trim(),
    "下载 Iterlay：https://iterlay.daived.com:31243/download",
    `好友激活码：${code.code}`,
    overview.campaign.redemptionEndsAt ? `兑换截止：${formatDate(overview.campaign.redemptionEndsAt)}` : ""
  ];
  return lines.filter(Boolean).join("\n");
}

function giftCampaignLabel(status: GiftActivationOverview["campaign"]["status"]): string {
  return ({
    draft: "活动准备中",
    scheduled: "即将开始",
    active: "发放中",
    redeeming: "仅限兑换",
    paused: "活动暂停",
    ended: "活动已结束"
  } as const)[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat((document.documentElement.lang || "zh-CN"), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("clipboard unavailable");
}
