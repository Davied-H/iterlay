import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  Film,
  ImagePlus,
  KeyRound,
  LayoutGrid,
  PanelTopOpen
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";

type ToastId = string | number;

type IterlayNoticeProps =
  | {
      kind: "reference";
      imageUrl?: string;
      imageUrls?: string[];
      count: number;
      addedCount?: number;
      detail?: string;
      total?: number;
    }
  | { kind: "copy"; title?: string; detail?: string; count?: number; shortcut?: string }
  | { kind: "export"; title?: string; path?: string; detail?: string; count?: number }
  | { kind: "processing" }
  | {
      kind: "result";
      count: number;
      title?: string;
      detail?: string;
      boardName?: string;
      previews: string[];
      onNavigate?: () => void;
    }
  | {
      kind: "video-result";
      succeeded: boolean;
      title: string;
      detail: string;
      onNavigate?: () => void;
    }
  | { kind: "partial"; actual: number; expected: number }
  | {
      kind: "placement";
      title: string;
      detail?: string;
      previews: string[];
      onUseReference?: () => void;
    }
  | { kind: "board"; name: string; imageCount: number; preview?: string; onNavigate: () => void }
  | { kind: "template"; name: string; updated?: boolean; onNavigate: () => void }
  | { kind: "slice"; count: number; previews: string[]; onDownload: () => void }
  | { kind: "balance"; balance: number; required: number; onActivate?: () => void }
  | {
      kind: "update";
      version?: string;
      badge?: string;
      title?: string;
      detail?: string;
      actionLabel?: string;
      onOpen: () => void;
    };

const EASE_OUT = [0.25, 1, 0.5, 1] as const;

function NoticeAction({
  children,
  icon,
  kind,
  onClick
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  kind: "navigate" | "primary" | "recovery" | "quiet";
  onClick: () => void;
}): React.ReactElement {
  return (
    <button className={cn("iterlay-notice__action", `iterlay-notice__action--${kind}`)} type="button" onClick={onClick}>
      {kind === "recovery" || kind === "primary" ? icon : null}
      <span>{children}</span>
      {kind === "recovery" || kind === "primary" ? null : <span className="iterlay-notice__action-icon">{icon}</span>}
    </button>
  );
}

function NoticeCopy({ title, detail }: { title: string; detail?: string }): React.ReactElement {
  return (
    <span className="iterlay-notice__copy">
      <span className="iterlay-notice__title">{title}</span>
      {detail ? <span className="iterlay-notice__detail" title={detail}>{detail}</span> : null}
    </span>
  );
}

function PreviewStack({
  previews,
  itemMotion
}: {
  previews: string[];
  itemMotion: (delay?: number) => Record<string, unknown>;
}): React.ReactElement {
  const visible = previews.slice(0, 3);
  const previewCount = Math.max(1, visible.length);
  return (
    <span
      className="iterlay-notice__result-stack"
      style={{ width: `${1.375 + (previewCount - 1) * 0.4375}rem` }}
      aria-hidden="true"
    >
      {visible.map((preview, index) => (
        <motion.span className="iterlay-notice__thumb" key={`${index}-${preview.slice(-16)}`} {...itemMotion(index * 0.045)}>
          <img src={preview} alt="" />
        </motion.span>
      ))}
    </span>
  );
}

function IterlayNotice({ notice, toastId }: { notice: IterlayNoticeProps; toastId: ToastId }): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const itemMotion = (delay = 0) => reduceMotion
    ? {}
    : {
        initial: { opacity: 0, scale: 0.82 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.2, delay, ease: EASE_OUT }
      };
  const runAction = (action: () => void): void => {
    toast.dismiss(toastId);
    action();
  };
  const openDownloadedPath = (targetPath: string): void => {
    void getImageWorkbenchApi()
      .openDownloadedPath(targetPath)
      .catch((error) => toast.error(getWorkbenchErrorMessage(error, "无法打开已下载的文件。")));
  };

  let content: React.ReactNode;
  if (notice.kind === "reference") {
    const total = notice.total ?? 4;
    const imageUrls = notice.imageUrls?.length ? notice.imageUrls : notice.imageUrl ? [notice.imageUrl] : [];
    const latestImage = imageUrls.at(-1);
    const title = notice.addedCount && notice.addedCount > 1
      ? `已加入 ${notice.addedCount} 张参考图`
      : "已加入参考图";
    content = (
      <>
        {latestImage ? (
          <motion.span className="iterlay-notice__thumb iterlay-notice__thumb--reference" {...itemMotion()}>
            <img src={latestImage} alt="" />
            <span className="iterlay-notice__thumb-check"><Check aria-hidden="true" /></span>
          </motion.span>
        ) : (
          <span className="iterlay-notice__status iterlay-notice__status--success"><ImagePlus aria-hidden="true" /></span>
        )}
        <NoticeCopy title={title} detail={notice.detail} />
        <span className="iterlay-notice__capacity" aria-label={`当前 ${notice.count} 张，共可添加 ${total} 张`}>
          {Array.from({ length: total }, (_, index) => (
            <motion.i
              className={index < notice.count ? "is-filled" : undefined}
              key={index}
              {...(index === notice.count - 1 ? itemMotion(0.08) : {})}
            >
              {index === notice.count - 1 && latestImage ? <img src={latestImage} alt="" /> : null}
            </motion.i>
          ))}
        </span>
      </>
    );
  } else if (notice.kind === "copy") {
    content = (
      <>
        <span className="iterlay-notice__copy-glyph" aria-hidden="true">
          <motion.i {...itemMotion(0.04)} />
          <motion.i {...itemMotion(0.08)} />
          <motion.b {...itemMotion(0.14)}><Check /></motion.b>
        </span>
        <NoticeCopy
          title={notice.title ?? (notice.count === 1 ? "已复制图片" : `已复制 ${notice.count ?? 1} 张图片`)}
          detail={notice.detail ?? (notice.shortcut ? "粘贴到鼠标位置" : undefined)}
        />
        {notice.shortcut ? <kbd className="iterlay-notice__keycap">{notice.shortcut}</kbd> : null}
      </>
    );
  } else if (notice.kind === "export") {
    const title = notice.title ?? (notice.count && notice.count > 1 ? `已下载 ${notice.count} 张图片` : "图片已下载");
    content = (
      <>
        <span className="iterlay-notice__status iterlay-notice__status--success">
          <motion.span
            initial={reduceMotion ? false : { y: -4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            <Download aria-hidden="true" />
          </motion.span>
        </span>
        <NoticeCopy title={title} detail={notice.detail ?? notice.path} />
        {notice.path ? (
          <NoticeAction
            kind="quiet"
            icon={<ExternalLink aria-hidden="true" />}
            onClick={() => runAction(() => openDownloadedPath(notice.path!))}
          >
            打开
          </NoticeAction>
        ) : null}
      </>
    );
  } else if (notice.kind === "processing") {
    content = (
      <>
        <motion.span
          className="iterlay-notice__spinner"
          aria-hidden="true"
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
        />
        <NoticeCopy title="生成仍在继续" detail="无需重复提交，完成后会自动显示" />
        <span className="iterlay-notice__live"><i />进行中</span>
      </>
    );
  } else if (notice.kind === "result") {
    const navigate = notice.onNavigate;
    content = (
      <>
        <PreviewStack previews={notice.previews} itemMotion={itemMotion} />
        <NoticeCopy
          title={notice.title ?? `已生成 ${notice.count} 张图片`}
          detail={notice.detail ?? (notice.boardName ? `已存入「${notice.boardName}」` : "已放入当前画板")}
        />
        {navigate ? (
          <NoticeAction
            kind="navigate"
            icon={<ArrowRight aria-hidden="true" />}
            onClick={() => runAction(navigate)}
          >
            前往
          </NoticeAction>
        ) : null}
      </>
    );
  } else if (notice.kind === "video-result") {
    content = (
      <>
        <span className={cn(
          "iterlay-notice__status",
          notice.succeeded ? "iterlay-notice__status--success" : "iterlay-notice__status--warning"
        )}>
          {notice.succeeded ? <Film aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
        </span>
        <NoticeCopy title={notice.title} detail={notice.detail} />
        {notice.onNavigate ? (
          <NoticeAction
            kind="navigate"
            icon={<ArrowRight aria-hidden="true" />}
            onClick={() => runAction(notice.onNavigate!)}
          >
            前往
          </NoticeAction>
        ) : null}
      </>
    );
  } else if (notice.kind === "partial") {
    content = (
      <>
        <span className="iterlay-notice__status iterlay-notice__status--warning">!</span>
        <NoticeCopy title={`已返回 ${notice.actual} / ${notice.expected} 张`} detail="其余图片未生成" />
        <span className="iterlay-notice__output-slots" aria-hidden="true">
          {Array.from({ length: notice.expected }, (_, index) => (
            <motion.i className={index < notice.actual ? "is-done" : undefined} key={index} {...itemMotion(index * 0.035)}>
              {index < notice.actual ? <Check /> : "×"}
            </motion.i>
          ))}
        </span>
      </>
    );
  } else if (notice.kind === "placement") {
    const useReference = notice.onUseReference;
    content = (
      <>
        <PreviewStack previews={notice.previews} itemMotion={itemMotion} />
        <NoticeCopy title={notice.title} detail={notice.detail} />
        {useReference ? (
          <NoticeAction
            kind="primary"
            icon={<ImagePlus aria-hidden="true" />}
            onClick={() => runAction(useReference)}
          >
            用作参考图
          </NoticeAction>
        ) : null}
      </>
    );
  } else if (notice.kind === "board") {
    content = (
      <>
        {notice.preview ? (
          <motion.span className="iterlay-notice__board-thumb" {...itemMotion()}><img src={notice.preview} alt="" /></motion.span>
        ) : (
          <span className="iterlay-notice__status iterlay-notice__status--success"><PanelTopOpen aria-hidden="true" /></span>
        )}
        <NoticeCopy title={`已导入「${notice.name}」`} detail={`${notice.imageCount} 张图片`} />
        <NoticeAction
          kind="navigate"
          icon={<ArrowRight aria-hidden="true" />}
          onClick={() => runAction(notice.onNavigate)}
        >
          前往
        </NoticeAction>
      </>
    );
  } else if (notice.kind === "template") {
    content = (
      <>
        <span className="iterlay-notice__status iterlay-notice__status--success"><LayoutGrid aria-hidden="true" /></span>
        <NoticeCopy title={notice.updated ? "模板已更新" : "模板已保存"} detail={`「${notice.name}」`} />
        <NoticeAction
          kind="navigate"
          icon={<ArrowRight aria-hidden="true" />}
          onClick={() => runAction(notice.onNavigate)}
        >
          查看详情
        </NoticeAction>
      </>
    );
  } else if (notice.kind === "slice") {
    content = (
      <>
        <span className="iterlay-notice__slice-grid" aria-hidden="true">
          {notice.previews.slice(0, 4).map((preview, index) => (
            <motion.img src={preview} alt="" key={`${index}-${preview.slice(-16)}`} {...itemMotion(index * 0.035)} />
          ))}
          {notice.previews.length === 0 ? <LayoutGrid /> : null}
        </span>
        <NoticeCopy title={`已切出 ${notice.count} 张图片`} detail="已放到画布右侧并全部选中" />
        <NoticeAction
          kind="primary"
          icon={<Download aria-hidden="true" />}
          onClick={() => runAction(notice.onDownload)}
        >
          下载 ZIP
        </NoticeAction>
      </>
    );
  } else if (notice.kind === "balance") {
    const activate = notice.onActivate;
    content = (
      <>
        <motion.span className="iterlay-notice__credit" {...itemMotion(0.04)}>
          <em>当前</em> {notice.balance} <em>/ 需要</em> {notice.required}
        </motion.span>
        <NoticeCopy title="官方 Provider 余额不足" detail="Prompt 已为你保留" />
        {activate ? (
          <NoticeAction
            kind="recovery"
            icon={<KeyRound aria-hidden="true" />}
            onClick={() => runAction(activate)}
          >
            激活授权
          </NoticeAction>
        ) : null}
      </>
    );
  } else {
    content = (
      <>
        <motion.span className="iterlay-notice__version" {...itemMotion(0.04)}>{notice.badge ?? `v${notice.version}`}</motion.span>
        <NoticeCopy title={notice.title ?? "发现新版本"} detail={notice.detail ?? "可稍后查看，不会中断当前工作"} />
        <NoticeAction
          kind="quiet"
          icon={<ChevronRight aria-hidden="true" />}
          onClick={() => runAction(notice.onOpen)}
        >
          {notice.actionLabel ?? "查看"}
        </NoticeAction>
      </>
    );
  }

  return (
    <motion.div
      className={cn(
        "iterlay-notice",
        `iterlay-notice--${notice.kind}`,
        notice.kind === "balance" && notice.onActivate && "iterlay-notice--has-action"
      )}
      initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.985, filter: "blur(1.5px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.21, ease: EASE_OUT }}
    >
      {content}
    </motion.div>
  );
}

function showNotice(notice: IterlayNoticeProps, duration: number): ToastId {
  return toast.custom(
    (toastId) => <IterlayNotice notice={notice} toastId={toastId} />,
    { className: "iterlay-toast--custom", duration, unstyled: true }
  );
}

export const iterlayToast = {
  referenceAdded(options: Omit<Extract<IterlayNoticeProps, { kind: "reference" }>, "kind">): ToastId {
    return showNotice({ kind: "reference", ...options }, 2200);
  },
  copied(options: Omit<Extract<IterlayNoticeProps, { kind: "copy" }>, "kind">): ToastId {
    return showNotice({ kind: "copy", ...options }, 2200);
  },
  exported(options: Omit<Extract<IterlayNoticeProps, { kind: "export" }>, "kind">): ToastId {
    return showNotice({ kind: "export", ...options }, options.path ? 4000 : 2400);
  },
  generationPending(): ToastId {
    return showNotice({ kind: "processing" }, Infinity);
  },
  result(options: Omit<Extract<IterlayNoticeProps, { kind: "result" }>, "kind">): ToastId {
    return showNotice({ kind: "result", ...options }, 3600);
  },
  videoResult(options: Omit<Extract<IterlayNoticeProps, { kind: "video-result" }>, "kind">): ToastId {
    return showNotice({ kind: "video-result", ...options }, 4200);
  },
  partial(options: Omit<Extract<IterlayNoticeProps, { kind: "partial" }>, "kind">): ToastId {
    return showNotice({ kind: "partial", ...options }, 3600);
  },
  placed(options: Omit<Extract<IterlayNoticeProps, { kind: "placement" }>, "kind">): ToastId {
    return showNotice({ kind: "placement", ...options }, options.onUseReference ? 4000 : 2400);
  },
  boardImported(options: Omit<Extract<IterlayNoticeProps, { kind: "board" }>, "kind">): ToastId {
    return showNotice({ kind: "board", ...options }, 4000);
  },
  templateSaved(options: Omit<Extract<IterlayNoticeProps, { kind: "template" }>, "kind">): ToastId {
    return showNotice({ kind: "template", ...options }, 4600);
  },
  sliced(options: Omit<Extract<IterlayNoticeProps, { kind: "slice" }>, "kind">): ToastId {
    return showNotice({ kind: "slice", ...options }, 4200);
  },
  balance(options: Omit<Extract<IterlayNoticeProps, { kind: "balance" }>, "kind">): ToastId {
    return showNotice({ kind: "balance", ...options }, 4400);
  },
  update(options: Omit<Extract<IterlayNoticeProps, { kind: "update" }>, "kind">): ToastId {
    return showNotice({ kind: "update", ...options }, 5000);
  },
  dismiss(id?: ToastId): void {
    toast.dismiss(id);
  }
};
