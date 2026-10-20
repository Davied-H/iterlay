import { useUiText } from "@/i18n";
import {
  Copy,
  Download,
  ImagePlus,
  Pencil,
  Share2,
  Star,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AssetOpsBarProps {
  favorite: boolean;
  canEdit?: boolean;
  onDownload: () => void;
  onCopyImage: () => void;
  onUseReference: () => void;
  onEditInCanvas: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onShareCard?: () => void;
}

interface OpDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  hidden?: boolean;
}

export function AssetOpsBar({
  favorite,
  canEdit,
  onDownload,
  onCopyImage,
  onUseReference,
  onEditInCanvas,
  onToggleFavorite,
  onDelete,
  onShareCard
}: AssetOpsBarProps): React.ReactElement {
  const uiText = useUiText();
  const ops: OpDef[] = [
    { key: "download", label: "下载", icon: <Download className="h-4 w-4" />, onClick: onDownload },
    { key: "copy", label: "复制图片", icon: <Copy className="h-4 w-4" />, onClick: onCopyImage },
    { key: "reference", label: "用作参考图", icon: <ImagePlus className="h-4 w-4" />, onClick: onUseReference },
    {
      key: "edit",
      label: "在画布中编辑",
      icon: <Pencil className="h-4 w-4" />,
      onClick: onEditInCanvas,
      hidden: !canEdit
    },
    {
      key: "share",
      label: "分享卡",
      icon: <Share2 className="h-4 w-4" />,
      onClick: onShareCard ?? (() => {}),
      hidden: !onShareCard
    },
    {
      key: "favorite",
      label: favorite ? "取消收藏" : "收藏",
      icon: (
        <Star
          className={cn("h-4 w-4 transition-all", favorite && "fill-current")}
        />
      ),
      onClick: onToggleFavorite
    },
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 className="h-4 w-4" />,
      onClick: onDelete,
      destructive: true
    }
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1">
        {ops
          .filter((op) => !op.hidden)
          .map((op) => (
            <Tooltip key={op.key}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    op.destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive"
                  )}
                  onClick={op.onClick}
                  aria-label={uiText(op.label)}
                >
                  {op.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{uiText(op.label)}</TooltipContent>
            </Tooltip>
          ))}
      </div>
    </TooltipProvider>
  );
}
