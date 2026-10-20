import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useI18n, useUiText } from "@/i18n";
import { getImageWorkbenchApi, hasImageWorkbenchApi } from "@/lib/image-workbench-api";
import { cn } from "@/lib/utils";
import { getProviderModels } from "@shared/provider-models";
import type {
  CreditStatus,
  FalModelPrice,
  ProviderConfig
} from "@shared/types";
import { IMAGE_CREDIT_COST } from "@shared/types";
import { Check, ChevronUp, Server, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ToolbarReveal, ToolbarTooltip } from "./PromptToolbar";

function providerModelPriceKey(providerId: string, model: string): string {
  return `${providerId}\u0000${model}`;
}

function formatFalModelPrice(price: FalModelPrice, locale: "zh-CN" | "en-US"): string {
  const currencySymbol = price.currency === "USD"
    ? "$"
    : price.currency === "EUR"
      ? "€"
      : price.currency === "CNY"
        ? "¥"
        : `${price.currency} `;
  const maximumFractionDigits = price.unitPrice < 0.001 ? 6 : price.unitPrice < 0.1 ? 4 : 2;
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits }).format(price.unitPrice);
  const unit = locale === "zh-CN"
    ? price.unit === "image" ? "张" : price.unit === "second" ? "秒" : price.unit === "megapixel" ? "MP" : price.unit
    : price.unit === "megapixel" ? "MP" : price.unit;
  return `${currencySymbol}${amount} / ${unit}`;
}

/** 输入框内的提供商切换器：一级选择 Provider，二级选择该 Provider 下的模型。 */
export function ProviderPicker({
  providers,
  activeProviderId,
  creditStatus,
  creditLoading,
  requiredCredits,
  onSelect,
  onManage,
  showLabel = true,
  reduceMotion = false
}: {
  providers: ProviderConfig[];
  activeProviderId: string;
  creditStatus: CreditStatus | null;
  creditLoading: boolean;
  requiredCredits: number;
  onSelect: (id: string, model?: string) => void;
  onManage: () => void;
  showLabel?: boolean;
  reduceMotion?: boolean;
}): React.ReactElement {
  const uiText = useUiText();

  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [falPrices, setFalPrices] = useState<Record<string, FalModelPrice | null>>({});
  const active = providers.find((p) => p.id === activeProviderId) ?? providers[0];
  const officialBalance = creditStatus?.credits.balance;
  const officialLow = officialBalance !== undefined && officialBalance < requiredCredits;
  const switchLabel = t("prompt.provider.switch");

  useEffect(() => {
    if (!open) return;
    const pending = providers.flatMap((provider) => {
      if (provider.type !== "fal") return [];
      return getProviderModels(provider).flatMap((model) => {
        const key = providerModelPriceKey(provider.id, model);
        return Object.prototype.hasOwnProperty.call(falPrices, key) ? [] : [{ provider, model, key }];
      });
    });
    if (pending.length === 0) return;

    if (!hasImageWorkbenchApi()) {
      setFalPrices((current) => Object.fromEntries([
        ...Object.entries(current),
        ...pending.map(({ key }) => [key, null] as const)
      ]));
      return;
    }

    let cancelled = false;
    void Promise.all(pending.map(async ({ provider, model, key }) => {
      try {
        const options = await getImageWorkbenchApi().listFalModels("text-to-image", model, provider.id);
        return [key, options.find((option) => option.endpointId === model)?.price ?? null] as const;
      } catch {
        return [key, null] as const;
      }
    })).then((entries) => {
      if (!cancelled) setFalPrices((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });

    return () => {
      cancelled = true;
    };
  }, [falPrices, open, providers]);

  function getPriceLabel(provider: ProviderConfig, model: string): string {
    if (provider.type === "official") {
      return t("prompt.provider.cost.credits", { credits: IMAGE_CREDIT_COST });
    }
    if (provider.type === "codex-oauth") {
      return t("prompt.provider.cost.included");
    }
    if (provider.type === "fal") {
      const key = providerModelPriceKey(provider.id, model);
      if (!Object.prototype.hasOwnProperty.call(falPrices, key)) {
        return t("prompt.provider.cost.loading");
      }
      const price = falPrices[key];
      if (price) return formatFalModelPrice(price, locale);
    }
    return t("prompt.provider.cost.provider");
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <ToolbarTooltip label={switchLabel} disabled={open}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={switchLabel}
            className={cn(
              "min-w-0 shrink gap-0 px-2 sm:px-2.5",
              active?.type === "official" && officialLow && "text-destructive hover:text-destructive"
            )}
          >
            <Server className="h-3.5 w-3.5 shrink-0" />
            <ToolbarReveal
              visible={showLabel}
              reduceMotion={reduceMotion}
              className="prompt-dock-provider-label max-w-40 text-xs"
            >
              <span className="block truncate">{active?.type === "official" ? uiText("官方 ·") : active?.name || "Provider"}</span>
            </ToolbarReveal>
            <ToolbarReveal visible={showLabel} reduceMotion={reduceMotion}>
              <ChevronUp className="h-3 w-3 shrink-0 opacity-60" />
            </ToolbarReveal>
          </Button>
        </DropdownMenuTrigger>
      </ToolbarTooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-60 shadow-md"
      >
        {providers.map((provider) => {
          const isActiveProvider = provider.id === active?.id;
          const models = getProviderModels(provider);
          return (
            <DropdownMenuSub key={provider.id}>
              <DropdownMenuSubTrigger
                className={cn("min-h-12 py-1.5", isActiveProvider && "bg-accent/60")}
              >
                <span className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-xs font-medium text-foreground">
                    {provider.name || t("prompt.provider.unnamed")}
                  </span>
                  <span className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {provider.model}
                  </span>
                </span>
                {provider.type === "official" ? (
                  <span className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground", officialLow && "text-destructive")}>
                    {creditLoading
                      ? t("prompt.provider.balance", { balance: "--" })
                      : t("prompt.provider.balance", { balance: officialBalance ?? "--" })}
                  </span>
                ) : null}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-80 max-w-[calc(100vw-1rem)] shadow-md">
                {models.map((model) => {
                  const isActive = isActiveProvider && model === active.model;
                  return (
                    <DropdownMenuItem
                      key={model}
                      onSelect={() => onSelect(provider.id, model)}
                      className={cn("min-h-9 text-xs", isActive && "bg-accent/60")}
                    >
                      <span className="min-w-0 flex-1 truncate">{model}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
                          title={t("prompt.provider.cost.hint")}
                        >
                          {getPriceLabel(provider, model)}
                        </span>
                        <span className="flex h-3.5 w-3.5 items-center justify-center">
                          {isActive ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-9 gap-2 text-xs"
          onSelect={onManage}
        >
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          {t("prompt.provider.manage")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 参考图选择器：dock 里"参考图"按钮的下拉。核心是"从画布选择"——把当前画板
 * 的图片做成缩略图网格，点一下即加为参考图；辅以本地上传。已加入的显示 ✓。
 */
