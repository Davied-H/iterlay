import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProviderStatusNoticeProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
}

export function ProviderStatusNotice({
  message,
  actionLabel,
  onAction
}: ProviderStatusNoticeProps): React.ReactElement {
  const credentialInvalid = message.includes("设备凭证已失效");
  const reduceMotion = useReducedMotion();
  const title = credentialInvalid ? "设备凭证已失效" : "生成服务暂不可用";
  const detail = credentialInvalid ? "请重新检查授权状态" : message;

  return (
    <motion.aside
      role="status"
      aria-live="polite"
      aria-label={message}
      initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.25, 1, 0.5, 1] }}
      className="fixed bottom-4 right-4 z-30 flex w-[min(312px,calc(100vw-24px))] items-center gap-2.5 rounded-lg border border-border/80 bg-popover px-2.5 py-2 text-popover-foreground shadow-sm [-webkit-app-region:no-drag] max-[1120px]:bottom-[8.25rem] max-[600px]:bottom-[7.75rem] max-[600px]:right-3"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
        <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-[13px] font-medium leading-4 text-foreground">{title}</strong>
        <span className="mt-0.5 block break-words text-xs leading-4 text-muted-foreground">{detail}</span>
      </span>
      <span className="h-7 w-px shrink-0 bg-border/80" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="group h-7 shrink-0 gap-0.5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
        onClick={onAction}
      >
        {actionLabel}
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </Button>
    </motion.aside>
  );
}
