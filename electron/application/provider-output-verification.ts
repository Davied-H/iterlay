import { randomUUID } from "node:crypto";
import { checkImageGeneration } from "../providers/diagnostics.js";
import { imageOutputConfigurationKey } from "../../shared/image-output.js";
import { originalImageMetadata } from "./image-output-delivery.js";
import type { ProviderConfig, ProviderTestOptions, GenerationJob } from "../../shared/types.js";
import type { SettingsStore } from "../storage/settings-store-core.js";
import type { AssetStore } from "../storage/asset-store.js";
import type { HistoryStore } from "../storage/history-store.js";
import type { ImageProviderAdapter } from "../providers/image-registry.js";

export async function verifyProviderOutput(
  config: ProviderConfig, options: ProviderTestOptions, apiKeyOverride: string | undefined,
  dependencies: { settings: SettingsStore; assets: AssetStore; history: HistoryStore; getProviderAdapter: (config: ProviderConfig) => ImageProviderAdapter }
) {
  const { settings, assets, history } = dependencies;
  const savedConfig = settings.getSettings().providers.find((provider) => provider.id === config.id);
  config = { ...config, credentialRevision: savedConfig?.credentialRevision };
  const key = apiKeyOverride?.trim() || settings.getApiKey(config.id);
  let job: GenerationJob | undefined;
  const result = await checkImageGeneration(config, options.acknowledgeCharges === true,
    (input) => dependencies.getProviderAdapter(config).generate(input, config, key), {
      outputFormat: options.outputFormat,
      save: async (images, input) => {
        const id = `provider-test-${randomUUID()}`;
        const paths = await assets.saveOutputs(id, images);
        job = { id, status: "succeeded", createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
          prompt: input.prompt, providerId: config.id, providerName: config.name, model: config.model,
          input: { ...input, providerId: config.id }, referenceImagePaths: [], outputImagePaths: paths, originalImagePaths: paths,
          originalOutputMetadata: images.map(originalImageMetadata), outputMetadata: images.map(originalImageMetadata),
          delivery: { status: "processing", options: {} } };
        await history.addJob(job);
        return paths;
      }
    });
  result.credentialRevision = config.credentialRevision;
  if (job) await history.updateJob({ ...job, execution: result.execution, delivery: { status: result.ok ? "succeeded" : "failed", options: {},
    error: result.ok ? undefined : result.message, completedAt: new Date().toISOString() }, warnings: result.ok ? [] : [result.message] });
  if (result.outputVerification && result.outputFormat && !apiKeyOverride?.trim()) {
    const receipt = result.outputVerification, format = result.outputFormat;
    await settings.transaction(() => {
      const current = settings.getSettings();
      const saved = current.providers.find((provider) => provider.id === config.id);
      if (!saved || imageOutputConfigurationKey(saved, config.model) !== receipt.configurationKey) return;
      const previous = saved.imageOutputVerifications?.[config.model]?.[format];
      if (previous?.configurationKey === receipt.configurationKey && Date.parse(receipt.checkedAt) <= Date.parse(previous.checkedAt)) {
        receipt.checkedAt = new Date(Date.parse(previous.checkedAt) + 1).toISOString();
      }
      settings.updateSettings({ providers: current.providers.map((provider) => provider.id !== config.id ? provider : {
        ...provider, imageOutputVerifications: { ...provider.imageOutputVerifications,
          [config.model]: { ...provider.imageOutputVerifications?.[config.model], [format]: receipt } }
      }) });
    });
  }
  return result;
}
