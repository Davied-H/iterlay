import { useEffect, useId, useState } from "react";
import type { ImageDeliveryOptions } from "@shared/types";
import { deliveryDimensions } from "@shared/image-output-delivery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useUiText } from "@/i18n";

export function ImageDeliverySettings({ value, onChange, showToggle = true }: { value?: ImageDeliveryOptions; onChange: (value: ImageDeliveryOptions | undefined) => void; showToggle?: boolean }): React.ReactElement {
  const uiText = useUiText();
  const id = useId();
  const [draft, setDraft] = useState(value?.size ?? "");
  useEffect(() => { setDraft(value?.size ?? ""); }, [value?.size]);
  let valid = true;
  try { deliveryDimensions(draft || undefined); } catch { valid = false; }
  return <fieldset className="mt-3 min-w-0 space-y-2.5 border-t border-border pt-3">
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={showToggle ? `${id}-enabled` : undefined} className="text-xs font-medium">{uiText("本地交付")}</label>
      {showToggle ? <Switch id={`${id}-enabled`} checked={Boolean(value)} onCheckedChange={(enabled) => onChange(enabled ? {} : undefined)} /> : null}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{uiText("保留模型原图，在本地转换格式和尺寸，不会再次调用模型。")}</p>
    {value ? <>
      <label className="block text-xs text-muted-foreground">{uiText("交付格式")}
        <select aria-label={uiText("交付格式")} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground" value={value.format ?? "original"}
          onChange={(event) => onChange({ ...value, format: event.target.value === "original" ? undefined : event.target.value as ImageDeliveryOptions["format"] })}>
          <option value="original">{uiText("沿用输出格式")}</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option>
        </select>
      </label>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) onChange({ ...value, size: draft || undefined }); }} className="space-y-1.5">
        <label className="block text-xs text-muted-foreground" htmlFor={`${id}-size`}>{uiText("交付像素（留空保留原尺寸）")}</label>
        <div className="flex min-w-0 gap-1.5">
          <Input id={`${id}-size`} aria-label={uiText("交付像素")} aria-invalid={!valid} value={draft} placeholder="1200x2000" onChange={(event) => setDraft(event.target.value.trim().toLowerCase().replace(/×/gu, "x"))} className="h-8 min-w-0 text-xs" />
          <Button type="submit" variant="outline" size="sm" className="h-8 shrink-0" disabled={!valid || draft === (value.size ?? "")}>{uiText("应用")}</Button>
        </div>
        {!valid ? <p role="alert" className="text-xs leading-5 text-destructive">{uiText("请输入宽x高，单边最多16384且不超过3200万像素。")}</p> : draft !== (value.size ?? "") ? <p className="text-xs text-muted-foreground">{uiText("新尺寸尚未应用。")}</p> : null}
      </form>
      {value.size ? <label className="block text-xs text-muted-foreground">{uiText("尺寸适配方式")}
        <select aria-label={uiText("尺寸适配方式")} value={value.fit ?? "scale"} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground" onChange={(event) => onChange({ ...value, fit: event.target.value as ImageDeliveryOptions["fit"] })}>
          <option value="scale">{uiText("比例接近时缩放")}</option><option value="cover">{uiText("裁切填满")}</option><option value="contain">{uiText("完整留白")}</option>
        </select>
      </label> : null}
      <p className="text-xs leading-5 text-muted-foreground">{uiText("放大不会增加原生细节；JPEG 的透明区域会铺白底。")}</p>
    </> : null}
  </fieldset>;
}
