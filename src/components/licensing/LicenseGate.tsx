import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ExternalLink, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { LicenseState, LicenseStatusSnapshot } from "@shared/licensing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getImageWorkbenchApi, getWorkbenchErrorMessage, hasImageWorkbenchApi, missingImageWorkbenchMessage } from "@/lib/image-workbench-api";
import { StartupLoading } from "@/components/system/StartupLoading";
import { LicenseContext, getLicenseStatusLabel, type LicenseContextValue } from "./license-context";
import "./license-gate.css";

export { StartupLoading } from "@/components/system/StartupLoading";

const BUY_URL = "https://iterlay.daived.com:31243/buy";
const PORTAL_URL = "https://iterlay.daived.com:31243/portal";
const urgentStates = new Set<LicenseState>(["OFFLINE_GRACE", "RESTRICTED", "REVOKED", "VERSION_BLOCKED"]);
const BACKGROUND_CHECK_THROTTLE_MS = 15_000;

interface LicenseGateProps {
  children?: ReactNode;
  delegateStartupLoading?: boolean;
}

type LicenseCenterView = "overview" | "activate";

export function LicenseGate({ children, delegateStartupLoading = false }: LicenseGateProps): React.ReactElement {
  const bridgeAvailable = hasImageWorkbenchApi();
  const [status, setStatus] = useState<LicenseStatusSnapshot | null>(null);
  const [centerOpen, setCenterOpen] = useState(false);
  const [centerView, setCenterView] = useState<LicenseCenterView>("overview");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const backgroundCheckInFlightRef = useRef(false);
  const lastBackgroundCheckAtRef = useRef(0);
  const startupBackgroundCheckStartedRef = useRef(false);

  const reportActionError = useCallback((actionError: unknown, fallback: string): void => {
    const message = getWorkbenchErrorMessage(actionError, fallback);
    setError(message);
    toast.error(message);
  }, []);

  const loadStatus = useCallback(async (): Promise<void> => {
    if (!hasImageWorkbenchApi()) return;
    try {
      setStatus(await getImageWorkbenchApi().getLicenseStatus());
    } catch (loadError) {
      setError(getWorkbenchErrorMessage(loadError, "无法读取本机授权状态。"));
    }
  }, []);

  const refreshStatusOnline = useCallback(async (force = false): Promise<void> => {
    if (!hasImageWorkbenchApi() || backgroundCheckInFlightRef.current) return;
    const now = Date.now();
    if (!force && now - lastBackgroundCheckAtRef.current < BACKGROUND_CHECK_THROTTLE_MS) return;
    backgroundCheckInFlightRef.current = true;
    lastBackgroundCheckAtRef.current = now;
    if (force) setChecking(true);
    try {
      setStatus(await getImageWorkbenchApi().checkLicense());
    } catch {
      // 后台复核失败时继续使用本地宽限状态；显式“立即复核”仍会向用户报告错误。
      await loadStatus();
    } finally {
      backgroundCheckInFlightRef.current = false;
      if (force) setChecking(false);
    }
  }, [loadStatus]);

  const openCenter = useCallback((): void => {
    if (!hasImageWorkbenchApi()) {
      toast.error(missingImageWorkbenchMessage);
      return;
    }
    setError("");
    setCenterView("overview");
    setChecking(true);
    setCenterOpen(true);
    void loadStatus()
      .then(() => refreshStatusOnline(true))
      .finally(() => setChecking(false));
  }, [loadStatus, refreshStatusOnline]);

  const openActivation = useCallback((clearError = false): void => {
    if (clearError) setError("");
    setCenterView("activate");
    setCenterOpen(true);
  }, []);

  const openActivationCenter = useCallback((): void => {
    openActivation(true);
  }, [openActivation]);

  const startTrial = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      setStatus(await getImageWorkbenchApi().startLicenseTrial());
    } catch (trialError) {
      reportActionError(trialError, "暂时无法开始试用。");
    } finally {
      setBusy(false);
    }
  }, [reportActionError]);

  const openPortal = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      await getImageWorkbenchApi().openLicensePortal();
    } catch (portalError) {
      reportActionError(portalError, "暂时无法打开客户中心。");
    } finally {
      setBusy(false);
    }
  }, [reportActionError]);

  const checkLicense = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      setStatus(await getImageWorkbenchApi().checkLicense());
    } catch (checkError) {
      reportActionError(checkError, "授权服务暂时不可用。");
    } finally {
      setBusy(false);
    }
  }, [reportActionError]);

  const activateLicense = useCallback(async (email: string, key: string): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      const next = await getImageWorkbenchApi().activateLicense(email, key);
      setStatus(next);
      if (next.capabilities.mode === "full") {
        setCenterView("overview");
      }
    } catch (activationError) {
      reportActionError(activationError, "激活失败，请检查邮箱和激活码。");
    } finally {
      setBusy(false);
    }
  }, [reportActionError]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status || status.state === "UNACTIVATED" || startupBackgroundCheckStartedRef.current) return;
    const timer = window.setTimeout(() => {
      if (startupBackgroundCheckStartedRef.current) return;
      startupBackgroundCheckStartedRef.current = true;
      void refreshStatusOnline();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshStatusOnline, status]);

  useEffect(() => {
    const refresh = (): void => {
      if (status && document.visibilityState === "visible") void refreshStatusOnline();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshStatusOnline, status]);

  useEffect(() => {
    if (!status) return;
    const refreshInterval = status.capabilities.mode === "full" ? 60_000 : 5_000;
    const timer = window.setInterval(() => void loadStatus(), refreshInterval);
    return () => window.clearInterval(timer);
  }, [loadStatus, status]);

  const contextValue = useMemo<LicenseContextValue>(
    () => ({
      status,
      busy,
      openCenter,
      openActivation: openActivationCenter,
      startupError: status ? undefined : error || undefined,
      retryStatus: () => void loadStatus()
    }),
    [busy, error, loadStatus, openActivationCenter, openCenter, status]
  );

  if (!bridgeAvailable) {
    return <LicenseContext.Provider value={contextValue}>{children}</LicenseContext.Provider>;
  }

  if (!status) {
    if (delegateStartupLoading) {
      return <LicenseContext.Provider value={contextValue}>{children}</LicenseContext.Provider>;
    }
    return <StartupLoading error={error} onRetry={() => void loadStatus()} />;
  }

  return (
    <LicenseContext.Provider value={contextValue}>
      {children}
      {urgentStates.has(status.state) ? (
        <LicenseBanner
          status={status}
          busy={busy}
          onActivate={() => openActivation(true)}
          onCheck={checkLicense}
        />
      ) : null}
      <LicenseCenter
        status={status}
        busy={busy}
        checking={checking}
        error={error}
        open={centerOpen}
        view={centerView}
        onOpenChange={(open) => {
          setCenterOpen(open);
          if (!open) {
            setCenterView("overview");
            setError("");
          }
        }}
        onActivate={activateLicense}
        onBack={() => setCenterView("overview")}
        onCheck={checkLicense}
        onOpenPortal={openPortal}
        onShowActivation={() => openActivation(false)}
        onStartTrial={startTrial}
      />
    </LicenseContext.Provider>
  );
}

function LicenseCenter({
  status,
  busy,
  checking,
  error,
  open,
  view,
  onOpenChange,
  onActivate,
  onBack,
  onCheck,
  onOpenPortal,
  onShowActivation,
  onStartTrial
}: {
  status: LicenseStatusSnapshot;
  busy: boolean;
  checking: boolean;
  error: string;
  open: boolean;
  view: LicenseCenterView;
  onOpenChange: (open: boolean) => void;
  onActivate: (email: string, key: string) => Promise<void>;
  onBack: () => void;
  onCheck: () => Promise<void>;
  onOpenPortal: () => Promise<void>;
  onShowActivation: () => void;
  onStartTrial: () => Promise<void>;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto">
        {view === "activate" ? (
          <ActivationForm busy={busy} error={error} onActivate={onActivate} onBack={onBack} />
        ) : (
          <LicenseOverview
            status={status}
            busy={busy}
            checking={checking}
            onCheck={onCheck}
            onOpenPortal={onOpenPortal}
            onShowActivation={onShowActivation}
            onStartTrial={onStartTrial}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LicenseOverview({
  status,
  busy,
  checking,
  onCheck,
  onOpenPortal,
  onShowActivation,
  onStartTrial
}: {
  status: LicenseStatusSnapshot;
  busy: boolean;
  checking: boolean;
  onCheck: () => Promise<void>;
  onOpenPortal: () => Promise<void>;
  onShowActivation: () => void;
  onStartTrial: () => Promise<void>;
}): React.ReactElement {
  const showPurchase = status.state !== "LICENSED";
  return (
    <>
      <DialogHeader className="sr-only">
        <DialogTitle>授权中心</DialogTitle>
        <DialogDescription>查看当前设备的授权状态。</DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between gap-3 border-b border-border pb-3 pr-8">
        <span className="text-sm font-medium">Iterlay 桌面版</span>
        <Badge variant={checking ? "outline" : getStatusBadgeVariant(status.state)}>
          {checking ? (
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
              正在复核
            </span>
          ) : getLicenseStatusLabel(status.state)}
        </Badge>
      </div>

      <LicenseDetails status={status} />

      {status.message ? (
        <p className="m-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="status">
          {status.message}
        </p>
      ) : null}

      <DialogFooter className="flex-wrap">
        {status.state === "LICENSED" ? (
          <Button variant="outline" disabled={busy} onClick={() => void onOpenPortal()}>
            {busy ? <Loader2 className="license-spin h-4 w-4" aria-hidden="true" /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
            管理授权
          </Button>
        ) : null}
        {showPurchase ? (
          <Button variant="outline" asChild>
            <a href={BUY_URL} target="_blank" rel="noreferrer">
              立即购买 <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </Button>
        ) : null}
        {status.state === "OFFLINE_GRACE" ? (
          <Button variant="outline" disabled={busy} onClick={() => void onCheck()}>
            {busy ? <Loader2 className="license-spin h-4 w-4" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            立即复核
          </Button>
        ) : null}
        {status.state === "UNACTIVATED" ? (
          <Button variant="outline" disabled={busy} onClick={() => void onStartTrial()}>
            {busy ? <Loader2 className="license-spin h-4 w-4" aria-hidden="true" /> : null}
            开始 3 天试用
          </Button>
        ) : null}
        {status.state !== "LICENSED" ? (
          <Button onClick={onShowActivation}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            输入激活码
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

function LicenseDetails({ status }: { status: LicenseStatusSnapshot }): React.ReactElement {
  if (status.state === "TRIAL_ACTIVE") {
    return (
      <dl className="m-0 grid gap-0 text-sm">
        <DetailRow label="剩余时间" value={formatRemaining(status.offlineValidUntil)} />
        <DetailRow label="截止时间" value={formatDateTime(status.offlineValidUntil)} />
      </dl>
    );
  }
  if (status.state === "LICENSED") {
    return (
      <dl className="m-0 grid gap-0 text-sm">
        <DetailRow label="授权邮箱" value={status.licenseEmail || "未提供"} />
        <DetailRow label="激活时间" value={formatDateTime(status.activatedAt)} />
        <DetailRow label="授权方案" value={formatPlan(status)} />
        {status.planType === "annual" ? <DetailRow label="年度到期" value={formatDateTime(status.validUntil)} /> : null}
        <DetailRow label="下次联网复核" value={formatDateTime(status.nextCheckAt)} />
      </dl>
    );
  }
  if (status.state === "OFFLINE_GRACE") {
    return (
      <dl className="m-0 grid gap-0 text-sm">
        <DetailRow label="当前状态" value="本机仍可正常使用，请尽快联网复核" />
        <DetailRow label="最晚联网时间" value={formatDateTime(status.offlineValidUntil)} />
      </dl>
    );
  }
  return (
    <p className="m-0 text-sm leading-relaxed text-muted-foreground">
      {status.state === "UNACTIVATED"
        ? "首次使用生成能力时会自动开始 3 天试用，也可以现在输入购买后的激活码。"
        : "当前授权需要处理。已有作品仍可查看和导出。"}
    </p>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4 border-b border-border py-2.5 last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-right font-medium text-foreground [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function ActivationForm({
  busy,
  error,
  onActivate,
  onBack
}: {
  busy: boolean;
  error: string;
  onActivate: (email: string, key: string) => Promise<void>;
  onBack: () => void;
}): React.ReactElement {
  const [email, setEmail] = useState("");
  const [key, setKey] = useState("");
  const valid = /^\S+@\S+\.\S+$/.test(email) && key.trim().length >= 10;

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (valid && !busy) void onActivate(email, key);
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="flex items-start gap-3 pr-8">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="返回授权中心" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <DialogHeader>
          <DialogTitle>输入激活码</DialogTitle>
          <DialogDescription>激活码会绑定购买邮箱，并占用当前设备的一个激活名额。</DialogDescription>
        </DialogHeader>
      </div>

      {error ? (
        <p className="m-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <label className="grid gap-2 text-sm font-medium">
        <span>购买邮箱</span>
        <Input autoFocus type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value.trim())} />
      </label>
      <div className="grid gap-2">
        <label className="grid gap-2 text-sm font-medium">
          <span>激活码</span>
          <Input autoComplete="off" spellCheck={false} placeholder="ITER-XXXX-XXXX-XXXX-XXXX" value={key} onChange={(event) => setKey(event.target.value.toUpperCase())} />
        </label>
        <a
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={PORTAL_URL}
          target="_blank"
          rel="noreferrer"
        >
          忘记激活码？前往客户中心重置
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onBack}>返回</Button>
        <Button type="submit" disabled={!valid || busy}>
          {busy ? <Loader2 className="license-spin h-4 w-4" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
          激活
        </Button>
      </DialogFooter>
      <p className="m-0 text-center text-xs text-muted-foreground">激活信息仅用于验证授权和管理设备额度。</p>
    </form>
  );
}

function LicenseBanner({
  status,
  busy,
  onActivate,
  onCheck
}: {
  status: LicenseStatusSnapshot;
  busy: boolean;
  onActivate: () => void;
  onCheck: () => Promise<void>;
}): React.ReactElement {
  const isGrace = status.state === "OFFLINE_GRACE";
  const label = status.state === "VERSION_BLOCKED"
    ? "当前版本不在授权范围内"
    : status.state === "REVOKED"
      ? "授权已停用"
      : status.state === "RESTRICTED"
        ? "试用或离线宽限已结束，当前为只读模式"
        : "授权需要联网复核";
  return (
    <div className="license-banner [-webkit-app-region:no-drag]" role="status">
      <span>{label}</span>
      {isGrace ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void onCheck()}>
          <RefreshCw aria-hidden="true" />立即复核
        </Button>
      ) : (
        <Button size="sm" onClick={onActivate}><KeyRound aria-hidden="true" />处理授权</Button>
      )}
    </div>
  );
}

function getStatusBadgeVariant(state: LicenseState): "default" | "muted" | "destructive" | "outline" {
  if (state === "LICENSED") return "default";
  if (state === "TRIAL_ACTIVE" || state === "OFFLINE_GRACE") return "outline";
  if (state === "RESTRICTED" || state === "REVOKED" || state === "VERSION_BLOCKED" || state === "UPDATE_REQUIRED") return "destructive";
  return "muted";
}

function formatPlan(status: LicenseStatusSnapshot): string {
  if (status.planType === "annual") return "年度授权";
  if (status.planType === "perpetual") {
    return status.maxMajorVersion == null ? "买断授权" : `买断授权 · Iterlay ${status.maxMajorVersion}.x`;
  }
  return "正式授权";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "未提供";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未提供";
  return new Intl.DateTimeFormat((document.documentElement.lang || "zh-CN"), {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatRemaining(value: string | null | undefined): string {
  if (!value) return "未提供";
  const remainingMinutes = Math.ceil((new Date(value).getTime() - Date.now()) / 60_000);
  if (!Number.isFinite(remainingMinutes)) return "未提供";
  if (remainingMinutes <= 0) return "已结束";
  const days = Math.floor(remainingMinutes / (24 * 60));
  const hours = Math.floor((remainingMinutes % (24 * 60)) / 60);
  const minutes = remainingMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
  if (hours > 0) return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  return `${minutes} 分钟`;
}
