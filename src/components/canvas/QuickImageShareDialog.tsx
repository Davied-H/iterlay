import { translateSourceText } from "@/i18n/ui-text";
import { useUiText } from "@/i18n";
import { useEffect, useState } from "react";
import { Copy, ImageIcon, Loader2, RadioTower } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import type { JobPromptInfo } from "@shared/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getImageWorkbenchApi, getWorkbenchErrorMessage } from "@/lib/image-workbench-api";
import type { GeneratedImage } from "./ImageNode";

interface QuickImageShareDialogProps {
  images: GeneratedImage[];
  boardId?: string;
  onOpenChange: (open: boolean) => void;
}

export function QuickImageShareDialog({
  images,
  boardId,
  onOpenChange
}: QuickImageShareDialogProps): React.ReactElement {
  const uiText = useUiText();

  const isSingleImage = images.length === 1;
  const image = images[0];
  const [shareUrl, setShareUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [showPrompt, setShowPrompt] = useState(Boolean(image?.jobId));
  const [promptInfo, setPromptInfo] = useState<JobPromptInfo | null>(null);

  useEffect(() => {
    if (!isSingleImage || !image?.jobId) return;
    let active = true;
    void getImageWorkbenchApi().getJobPrompt(image.jobId)
      .then((result) => {
        if (active) setPromptInfo(result);
      })
      .catch(() => {
        if (active) setPromptInfo(null);
      });
    return () => {
      active = false;
    };
  }, [image?.jobId, isSingleImage]);

  useEffect(() => {
    let active = true;
    let qrReady = false;
    setShareUrl("");
    setQrDataUrl("");
    setError("");
    void getImageWorkbenchApi().startOnlineImageShare({
      ...(isSingleImage ? { sourcePath: image.path, jobId: image.jobId || undefined } : {
        sourcePaths: images.map((item) => item.path),
        jobIds: images.map((item) => item.jobId)
      }),
      showPrompt,
      origin: boardId ? { boardId, nodeIds: images.map((item) => item.id) } : undefined
    })
      .then(async (result) => {
        const qr = await QRCode.toDataURL(result.url, {
          width: 240,
          margin: 1,
          color: { dark: "#11211b", light: "#ffffff" }
        });
        if (!active) return;
        qrReady = true;
        setShareUrl(result.url);
        setQrDataUrl(qr);
      })
      .catch((caught) => {
        if (active) {
          void getImageWorkbenchApi().stopOnlineShare().catch(() => undefined);
          setError(getWorkbenchErrorMessage(caught, "无法启动图片快速分享。"));
        }
      });
    return () => {
      active = false;
      if (!qrReady) void getImageWorkbenchApi().stopOnlineShare().catch(() => undefined);
    };
  }, [boardId, image?.id, image?.jobId, image?.path, images, isSingleImage, showPrompt]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isSingleImage ? uiText("快速分享图片") : uiText("快速分享 {{ui:0}} 张图片", [images.length])}</DialogTitle>
          <DialogDescription>{uiText("通过 Manager 建立在线连接，手机无需与电脑处于同一网络。")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{uiText("显示生成详情")}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon aria-hidden className="h-3.5 w-3.5" />
              {isSingleImage && promptInfo
                ? uiText("{{ui:0}} 张参考图", [promptInfo.referenceImages.length])
                : images.some((item) => item.jobId)
                  ? isSingleImage ? uiText("正在读取生成信息") : uiText("在每张图片的详情中展示提示词与参考图")
                  : uiText("所选图片没有生成信息")}
            </p>
          </div>
          <Switch
            checked={showPrompt}
            disabled={!images.some((item) => item.jobId)}
            aria-label={uiText("显示生成详情")}
            onCheckedChange={setShowPrompt}
          />
        </div>
        <div className="flex min-h-[300px] flex-col items-center justify-center border-y border-border py-5 text-center">
          {error ? (
            <>
              <RadioTower className="h-8 w-8 text-destructive" />
              <p className="mt-3 text-sm font-medium text-destructive">{uiText("无法创建在线分享")}</p>
              <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{error}</p>
            </>
          ) : qrDataUrl ? (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {uiText("分享已开启")}</div>
              <div className="mt-4 rounded-md bg-white p-3 shadow-sm">
                <img src={qrDataUrl} alt={uiText("{{ui:0}}图片快速分享二维码", [isSingleImage ? "单张" : `${images.length} 张`])} className="h-[210px] w-[210px]" />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl);
                  toast.success(translateSourceText("分享链接已复制"));
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {uiText("复制分享链接")}</Button>
            </>
          ) : (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground motion-reduce:animate-none" />
              <p className="mt-3 text-sm text-muted-foreground">{uiText("正在建立在线连接")}</p>
            </>
          )}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {uiText("关闭弹窗后分享仍然有效，可在“更多 → 在线分享管理”中关闭；退出 APP 时会自动断开。")}</p>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{uiText("完成")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
