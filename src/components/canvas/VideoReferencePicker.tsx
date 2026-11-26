import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, Upload, Video } from "lucide-react";
import { useUiText } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { GeneratedImage } from "./image-node-model";
import type { VideoReferenceInput } from "./video-node-model";
import { useCanvasThumbnail } from "./use-canvas-thumbnail";

interface VideoReferencePickerProps {
  label: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  images?: GeneratedImage[];
  videos?: VideoReferenceInput[];
  selectedIds?: string[];
  onChooseImage?: (image: GeneratedImage) => void;
  onChooseVideo?: (video: VideoReferenceInput) => void;
  onUpload?: (files: File[]) => Promise<void>;
  multiple?: boolean;
}

export function VideoReferencePicker({ label, children, className, disabled, images, videos, selectedIds = [], onChooseImage, onChooseVideo, onUpload, multiple }: VideoReferencePickerProps): React.ReactElement {
  const uiText = useUiText();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const isVideo = videos !== undefined;
  return <Popover open={open} onOpenChange={(next) => { if (!uploading) { setOpen(next); setError(""); } }}>
    <PopoverTrigger asChild>
      <button type="button" className={className} aria-label={label} disabled={disabled} onKeyDown={(event) => event.stopPropagation()}>{children}</button>
    </PopoverTrigger>
    <PopoverContent align="start" className="video-reference-picker nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <div className="video-reference-picker__heading"><strong>{label}</strong><span>{uiText("从画布选择")}</span></div>
      <div className={isVideo ? "video-reference-picker__videos" : "video-reference-picker__grid"}>
        {images?.map((image, index) => <button type="button" key={image.id} disabled={uploading} aria-label={uiText("选择画布图片 {{ui:0}}", [index + 1])} aria-pressed={selectedIds.includes(image.id)} onClick={() => { onChooseImage?.(image); setOpen(false); }}><PickerImage image={image} /><span>{uiText("图片 {{ui:0}}", [index + 1])}</span></button>)}
        {videos?.map((video) => <button type="button" key={video.id} disabled={uploading} aria-pressed={selectedIds.includes(video.id)} onClick={() => { onChooseVideo?.(video); setOpen(false); }}><Video aria-hidden /><span>{video.name}</span></button>)}
      </div>
      {!(images?.length || videos?.length) ? <p className="video-reference-picker__empty"><ImagePlus aria-hidden />{uiText(isVideo ? "画布中还没有可用视频" : "画布中还没有可用图片")}</p> : null}
      {error ? <p className="video-generation-input-error" role="alert">{error}</p> : null}
      {onUpload ? <>
        <Button type="button" variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <Upload data-icon="inline-start" />}{uiText(uploading ? "正在导入…" : isVideo ? "上传视频" : "上传图片")}
        </Button>
        <input ref={input} type="file" hidden multiple={multiple} accept={isVideo ? "video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm,.m4v" : "image/*"} onChange={(event) => {
          const files = Array.from(event.target.files ?? []); event.target.value = "";
          if (!files.length) return;
          setUploading(true); setError("");
          void onUpload(files).then(() => setOpen(false)).catch((reason) => setError(reason instanceof Error ? reason.message : uiText("素材导入失败，请重试。"))).finally(() => setUploading(false));
        }} />
      </> : null}
      <p className="video-reference-picker__hint">{uiText("也可以将画布素材连到对应输入点")}</p>
    </PopoverContent>
  </Popover>;
}

function PickerImage({ image }: { image: GeneratedImage }): React.ReactElement {
  const thumbnail = useCanvasThumbnail(image.path, image.dataUrl, 192, true);
  return thumbnail ? <img src={thumbnail} alt="" loading="lazy" /> : <ImagePlus aria-hidden />;
}
