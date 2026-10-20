import type { GenerateImageInput } from "@shared/types";
import { getUseCasesForMode } from "@shared/workflow";

export interface PluginImageRecipe {
  prompt: string;
  size: string;
  useCase: GenerateImageInput["useCase"];
  creationMode: GenerateImageInput["creationMode"];
}

/** Only generation parameters cross the sandbox boundary, never billing/provider metadata. */
export function validateImageRecipe(value: unknown): PluginImageRecipe {
  if (!value || typeof value !== "object") throw new Error("插件返回的生成方案无效。");
  const recipe = value as Record<string, unknown>;
  if (typeof recipe.prompt !== "string" || !recipe.prompt.trim() || recipe.prompt.length > 30_000
    || typeof recipe.size !== "string" || !/^(auto|[1-9]\d{1,3}x[1-9]\d{1,3})$/.test(recipe.size)
    || !getUseCasesForMode("generate").some(option => option.slug === recipe.useCase)
    || !["general", "ui-design"].includes(String(recipe.creationMode))) throw new Error("插件返回的生成方案无效。");
  return { prompt: recipe.prompt, size: recipe.size,
    useCase: recipe.useCase as PluginImageRecipe["useCase"],
    creationMode: recipe.creationMode as PluginImageRecipe["creationMode"] };
}
