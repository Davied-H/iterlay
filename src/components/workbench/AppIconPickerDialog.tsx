import { useUiText } from "@/i18n";
import { useRef, useState } from "react";
import { Check, Loader2, LockKeyhole, Plus, Trash2 } from "lucide-react";
import type { AppIconPreference, CustomAppIcon } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import appIconMascot from "@/assets/app-icon-mascot.png";
import { cn } from "@/lib/utils";

const ACCEPTED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

interface AppIconPickerDialogProps {
  open: boolean;
  appIcon: AppIconPreference;
  customAppIcons: CustomAppIcon[];
  busy: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (appIcon: AppIconPreference) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AppIconPickerDialog({
  open,
  appIcon,
  customAppIcons,
  busy,
  error,
  onOpenChange,
  onSelect,
  onUpload,
  onDelete
}: AppIconPickerDialogProps): React.ReactElement {
  const uiText = useUiText();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomAppIcon | null>(null);
  const [dragging, setDragging] = useState(false);

  async function selectFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setLocalError(null);
    if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
      setLocalError("请选择 PNG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setLocalError("头像文件不能超过 10 MB。");
      return;
    }
    await onUpload(file);
  }

  function changeOpen(next: boolean): void {
    if (!next && busy) return;
    setLocalError(null);
    onOpenChange(next);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="settings-aux-dialog w-[calc(100vw-32px)] max-w-lg gap-4 p-5">
          <DialogHeader className="pr-8">
            <DialogTitle>{uiText("伙伴头像")}</DialogTitle>
            <DialogDescription>{uiText("选择系统头像，或上传自己的头像。")}</DialogDescription>
          </DialogHeader>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              void selectFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />

          <div
            className="grid max-h-[min(430px,60vh)] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4"
            role="radiogroup"
            aria-label={uiText("伙伴头像")}
            onDragEnter={(event) => {
              if (!busy && event.dataTransfer.types.includes("Files")) setDragging(true);
            }}
            onDragOver={(event) => {
              if (busy || !event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!busy) void selectFile(event.dataTransfer.files[0]);
            }}
          >
            <AvatarOption
              name="系统伙伴"
              source={appIconMascot}
              selected={appIcon === "mascot"}
              disabled={busy}
              system
              onSelect={() => void onSelect("mascot")}
            />
            {customAppIcons.map((icon) => (
              <AvatarOption
                key={icon.id}
                name={icon.name}
                source={icon.dataUrl}
                selected={appIcon === `custom:${icon.id}`}
                disabled={busy}
                onSelect={() => void onSelect(`custom:${icon.id}`)}
                onDelete={() => setDeleteTarget(icon)}
              />
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex aspect-square min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                dragging
                  ? "border-foreground/55 bg-muted text-foreground ring-2 ring-foreground/10"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-foreground/35 hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              <span className="text-xs font-medium">{dragging ? uiText("松开上传") : uiText("上传头像")}</span>
            </button>
          </div>

          {localError || error ? (
            <p className="text-xs text-destructive" role="alert">{localError || error}</p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(next) => !next && !busy && setDeleteTarget(null)}>
        <DialogContent className="settings-aux-dialog w-[calc(100vw-32px)] max-w-sm">
          <DialogHeader>
            <DialogTitle>{uiText("删除“")}{deleteTarget?.name}”？</DialogTitle>
            <DialogDescription>{uiText("头像会从历史中移除，删除后无法恢复。")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDeleteTarget(null)}>{uiText("取消")}</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                void onDelete(deleteTarget.id).then(() => setDeleteTarget(null));
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {uiText("删除")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AvatarOption({
  name,
  source,
  selected,
  disabled,
  system,
  onSelect,
  onDelete
}: {
  name: string;
  source: string;
  selected: boolean;
  disabled: boolean;
  system?: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className={cn(
      "group/avatar relative aspect-square min-w-0 overflow-hidden rounded-lg border bg-muted/35",
      selected ? "border-foreground/45 ring-2 ring-foreground/10" : "border-border"
    )}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={uiText("使用{{ui:0}}", [name])}
        disabled={disabled}
        onClick={onSelect}
        className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <img src={source} alt="" aria-hidden className="h-[58%] w-[58%] rounded-lg object-cover" />
        <span className="w-full truncate text-center text-[11px] font-medium text-foreground">{name}</span>
      </button>
      {selected ? (
        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background" aria-hidden>
          <Check className="h-3 w-3" strokeWidth={2.5} />
        </span>
      ) : null}
      {system ? (
        <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/90 text-muted-foreground" title={uiText("系统预置")}>
          <LockKeyhole className="h-3 w-3" />
        </span>
      ) : onDelete ? (
        <button
          type="button"
          disabled={disabled}
          aria-label={uiText("删除头像 {{ui:0}}", [name])}
          title={uiText("删除 {{ui:0}}", [name])}
          onClick={onDelete}
          className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-100 shadow-sm transition-[opacity,color,background-color] hover:bg-destructive hover:text-destructive-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover/avatar:opacity-100 disabled:pointer-events-none"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
