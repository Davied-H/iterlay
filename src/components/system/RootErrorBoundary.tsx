import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { Check, ChevronDown, Copy, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import packageMetadata from "../../../package.json";
import { Button } from "@/components/ui/button";

interface RootErrorBoundaryProps {
  children: ReactNode;
}

type CopyState = "idle" | "copied" | "failed";

interface RootErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  copyState: CopyState;
  incidentId: string;
  occurredAt: string;
  reloading: boolean;
}

interface CrashReportInput {
  error: Error;
  componentStack: string;
  incidentId: string;
  occurredAt: string;
}

const MAX_REPORT_FIELD_LENGTH = 12_000;

function createIncidentId(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "0");
  return `ITR-RDR-${suffix}`;
}

function sanitizeDiagnosticText(value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text
    .slice(0, MAX_REPORT_FIELD_LENGTH)
    .replace(/\/Users\/[^/\s]+/g, "~")
    .replace(/\/home\/[^/\s]+/g, "~")
    .replace(/\b[A-Za-z]:\\Users\\[^\\\s]+/g, "~")
    .replace(
      /([?&](?:api[_-]?key|access[_-]?token|code|id[_-]?token|license[_-]?key|password|refresh[_-]?token|secret|token)=)[^&#\s]+/gi,
      "$1[redacted]"
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/gi, "$1-[redacted]")
    .replace(
      /((?:api[_ -]?key|access[_ -]?token|authorization|id[_ -]?token|license[_ -]?key|password|refresh[_ -]?token|secret)\s*[:=]\s*)["']?[^,;\s"']+["']?/gi,
      "$1[redacted]"
    )
    .replace(/data:[^,\s]+,[A-Za-z0-9+/=_-]{24,}/gi, "data:[redacted]");
}

function getErrorMetadata(error: Error): string[] {
  const source = error as Error & Record<string, unknown>;
  return ["code", "status", "requestId"].flatMap((key) => {
    const value = source[key];
    if (typeof value !== "string" && typeof value !== "number") return [];
    return [`${key}: ${sanitizeDiagnosticText(value)}`];
  });
}

function getSurfaceLabel(): string {
  try {
    return window.location.protocol === "file:" ? "desktop" : window.location.pathname || "/";
  } catch {
    return "unknown";
  }
}

function buildCrashReport({
  error,
  componentStack,
  incidentId,
  occurredAt
}: CrashReportInput): string {
  const metadata = getErrorMetadata(error);
  const cause = error.cause === undefined ? [] : [`cause: ${sanitizeDiagnosticText(error.cause)}`];
  const errorSummary = [
    `${sanitizeDiagnosticText(error.name || "Error")}: ${sanitizeDiagnosticText(error.message || "No error message")}`,
    ...metadata,
    ...cause
  ].join("\n");
  const javascriptStack = sanitizeDiagnosticText(error.stack || "Unavailable");
  const reactStack = sanitizeDiagnosticText(componentStack.trim() || "Unavailable");
  const runtime = typeof navigator === "undefined" ? "unknown" : sanitizeDiagnosticText(navigator.userAgent);
  const locale = typeof navigator === "undefined" ? "unknown" : sanitizeDiagnosticText(navigator.language);
  const viewport = typeof window === "undefined" ? "unknown" : `${window.innerWidth}x${window.innerHeight}`;

  return [
    "Iterlay renderer diagnostics",
    `Error ID: ${incidentId}`,
    `Occurred at: ${occurredAt}`,
    `App version: ${packageMetadata.version}`,
    `Surface: ${getSurfaceLabel()}`,
    `Viewport: ${viewport}`,
    `Locale: ${locale}`,
    `Runtime: ${runtime}`,
    "",
    "Error",
    errorSummary,
    "",
    "JavaScript stack",
    javascriptStack,
    "",
    "React component stack",
    reactStack
  ].join("\n");
}

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Electron and browsers can reject the async API when focus or permissions change.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error("clipboard unavailable");
}

export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null,
    componentStack: "",
    copyState: "idle",
    incidentId: createIncidentId(),
    occurredAt: new Date().toISOString(),
    reloading: false
  };

  private readonly detailsRef = createRef<HTMLDetailsElement>();

  static getDerivedStateFromError(error: Error): Partial<RootErrorBoundaryState> {
    return {
      error,
      copyState: "idle",
      incidentId: createIncidentId(),
      occurredAt: new Date().toISOString()
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? "" });
    console.error("Iterlay renderer crashed", error, info.componentStack);
  }

  private readonly copyDiagnostics = async (): Promise<void> => {
    if (!this.state.error) return;
    const report = buildCrashReport({
      error: this.state.error,
      componentStack: this.state.componentStack,
      incidentId: this.state.incidentId,
      occurredAt: this.state.occurredAt
    });
    try {
      await writeClipboardText(report);
      this.setState({ copyState: "copied" });
    } catch {
      this.setState({ copyState: "failed" });
      this.detailsRef.current?.setAttribute("open", "");
    }
  };

  private readonly reload = (): void => {
    this.setState({ reloading: true }, () => window.location.reload());
  };

  render(): ReactNode {
    const { componentStack, copyState, error, incidentId, occurredAt, reloading } = this.state;
    if (!error) return this.props.children;

    const report = buildCrashReport({ error, componentStack, incidentId, occurredAt });
    const errorMessage = sanitizeDiagnosticText(error.message || "未提供错误信息");
    const copyLabel = copyState === "copied" ? "已复制" : "复制诊断信息";

    return (
      <main className="flex min-h-screen overflow-y-auto bg-background px-4 py-16 text-foreground sm:px-6 sm:py-20">
        <section className="m-auto w-full max-w-xl [-webkit-app-region:no-drag]" aria-labelledby="root-error-title">
          <div className="text-center" role="alert">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg border border-destructive/15 bg-destructive/10 text-destructive">
              <TriangleAlert className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 id="root-error-title" className="mt-4 text-base font-semibold leading-6">
              工作区暂时无法显示
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              已保存的画板仍在本机。重新加载通常可以恢复界面。
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--success))]" aria-hidden="true" />
              无需重新创建工作区
            </p>
          </div>

          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto sm:min-w-32" type="button" disabled={reloading} onClick={this.reload}>
              <RefreshCw className={`h-4 w-4 ${reloading ? "animate-spin" : ""}`} aria-hidden="true" />
              {reloading ? "正在重新加载…" : "重新加载"}
            </Button>
            <Button
              className="w-full transition-colors sm:w-auto sm:min-w-40"
              type="button"
              variant="outline"
              onClick={() => void this.copyDiagnostics()}
            >
              {copyState === "copied"
                ? <Check className="h-4 w-4 text-[hsl(var(--success))]" aria-hidden="true" />
                : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copyLabel}
            </Button>
          </div>

          <div className="mt-2 min-h-5 text-center text-xs leading-5" aria-live="polite" role="status">
            {copyState === "copied" ? (
              <span className="text-[hsl(var(--success))]">诊断信息已复制，可以直接发给开发者。</span>
            ) : copyState === "failed" ? (
              <span className="text-destructive">复制失败，请在下方手动选择错误详情。</span>
            ) : reloading ? (
              <span className="text-muted-foreground">正在带你回到工作区…</span>
            ) : null}
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
            <div className="border-b border-border px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">错误摘要</span>
                <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground">
                  {sanitizeDiagnosticText(error.name || "Error")}
                </code>
              </div>
              <p className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap break-words text-[13px] leading-5">
                {errorMessage}
              </p>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">问题编号 {incidentId}</p>
            </div>

            <details ref={this.detailsRef} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-xs font-medium outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
                <span>查看技术详情</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <div className="border-t border-border bg-muted/35 px-4 py-4 sm:px-5">
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-muted-foreground selection:bg-foreground selection:text-background">
                  {report}
                </pre>
                <p className="mt-3 border-t border-border pt-3 text-[11px] leading-4 text-muted-foreground">
                  诊断信息不包含画板内容、提示词或密钥，个人目录也已隐藏。
                </p>
              </div>
            </details>
          </div>
        </section>
      </main>
    );
  }
}
