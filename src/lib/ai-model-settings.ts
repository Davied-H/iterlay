import { getProviderModels, selectProviderModel } from "@shared/provider-models";
import type { CodexAuthStatus, ProviderConfig, TextProviderConfig, VideoProviderConfig } from "@shared/types";

export type ModelKind = "image" | "text" | "video";
export type ModelProvider = ProviderConfig | TextProviderConfig | VideoProviderConfig;
export interface ModelSettingsSnapshot {
  providers: ProviderConfig[];
  activeProviderId: string;
  textProviders: TextProviderConfig[];
  activeTextProviderId: string;
  videoProviders: VideoProviderConfig[];
  activeVideoProviderId: string;
}
export interface ModelService {
  kind: ModelKind;
  provider: ModelProvider;
}
export interface ModelChoice extends ModelService {
  model: string;
}
export interface ConnectionState {
  ready: boolean;
  reason: "managed" | "account" | "key" | "missing-key" | "login" | "missing-config" | "missing-connection";
}

export function modelServiceKey(service: ModelService): string {
  return `${service.kind}:${service.provider.id}`;
}

export function modelServices(snapshot: ModelSettingsSnapshot): ModelService[] {
  return [
    ...snapshot.providers.map((provider) => ({
      kind: "image" as const,
      provider
    })),
    ...snapshot.textProviders.map((provider) => ({
      kind: "text" as const,
      provider
    })),
    ...snapshot.videoProviders.map((provider) => ({
      kind: "video" as const,
      provider
    }))
  ];
}

export function connectionOwnerId(service: ModelService): string {
  if (service.kind === "text" && service.provider.type === "codex-oauth") {
    return (service.provider as TextProviderConfig).authProviderId || service.provider.id;
  }
  if (service.kind === "video" && ["fal", "openrouter"].includes(service.provider.type)) {
    return (service.provider as VideoProviderConfig).connectionProviderId || service.provider.id;
  }
  return service.provider.id;
}

export function connectionState(
  service: ModelService,
  snapshot: ModelSettingsSnapshot,
  keys: Record<string, boolean>,
  accounts: Record<string, CodexAuthStatus>
): ConnectionState {
  const { provider, kind } = service;
  if (provider.type === "official") return { ready: true, reason: "managed" };
  if (provider.type === "codex-oauth") {
    const ready = ["connected", "refreshing"].includes(
      accounts[connectionOwnerId(service)]?.state ?? "signed-out"
    );
    return {
      ready: ready && Boolean(provider.model.trim()),
      reason: !ready ? "login" : provider.model.trim() ? "account" : "missing-config"
    };
  }
  let address = provider.baseUrl;
  if (kind === "video" && (provider as VideoProviderConfig).connectionProviderId) {
    const source = snapshot.providers.find(
      (item) => item.id === connectionOwnerId(service) && item.type === provider.type
    );
    if (!source) return { ready: false, reason: "missing-connection" };
    address = source.baseUrl;
  }
  if (!address.trim() || !provider.model.trim()) return { ready: false, reason: "missing-config" };
  if (!keys[connectionOwnerId(service)]) return { ready: false, reason: "missing-key" };
  return { ready: true, reason: "key" };
}

export function modelChoices(snapshot: ModelSettingsSnapshot, kind: ModelKind): ModelChoice[] {
  return modelServices(snapshot)
    .filter((service) => service.kind === kind)
    .flatMap((service) => {
      const models = kind === "text" ? [service.provider.model] : getProviderModels(service.provider);
      return (models.length ? models : service.provider.type === "official" ? [""] : []).map((model) => ({
        ...service,
        model
      }));
    });
}

export function selectDefaultModel(
  snapshot: ModelSettingsSnapshot,
  choice: ModelChoice
): ModelSettingsSnapshot {
  const { kind, provider, model } = choice;
  if (kind === "image")
    return {
      ...snapshot,
      activeProviderId: provider.id,
      providers: snapshot.providers.map((item) =>
        item.id === provider.id ? selectProviderModel(item, model) : item
      )
    };
  if (kind === "text") return { ...snapshot, activeTextProviderId: provider.id };
  return {
    ...snapshot,
    activeVideoProviderId: provider.id,
    videoProviders: snapshot.videoProviders.map((item) =>
      item.id === provider.id
        ? {
            ...item,
            model,
            models: getProviderModels({
              model,
              models: getProviderModels(item)
            })
          }
        : item
    )
  };
}

export function upsertModelService(
  snapshot: ModelSettingsSnapshot,
  service: ModelService
): ModelSettingsSnapshot {
  const update = <T extends ModelProvider>(items: T[], value: T): T[] =>
    items.some((item) => item.id === value.id)
      ? items.map((item) => (item.id === value.id ? value : item))
      : [...items, value];
  if (service.kind === "image")
    return {
      ...snapshot,
      providers: update(snapshot.providers, service.provider as ProviderConfig)
    };
  if (service.kind === "text")
    return {
      ...snapshot,
      textProviders: update(snapshot.textProviders, service.provider as TextProviderConfig)
    };
  return {
    ...snapshot,
    videoProviders: update(snapshot.videoProviders, service.provider as VideoProviderConfig)
  };
}

export function removeModelService(
  snapshot: ModelSettingsSnapshot,
  service: ModelService
): ModelSettingsSnapshot {
  const id = service.provider.id;
  const providers = snapshot.providers.flatMap((provider) => {
    if (service.kind === "image" && provider.id === id) return [];
    if (
      service.kind === "text" &&
      service.provider.type === "codex-oauth" &&
      provider.id === connectionOwnerId(service)
    ) {
      return [{ ...provider, autoBindText: false }];
    }
    return [provider];
  });
  // Auth IDs own account credentials independently of the image service. Keeping
  // the text service retains its login when the image service is removed.
  const textProviders =
    service.kind === "text"
      ? snapshot.textProviders.filter((provider) => provider.id !== id)
      : snapshot.textProviders;
  const videoProviders = snapshot.videoProviders.flatMap((provider) => {
    if (service.kind === "video" && provider.id === id) return [];
    if (service.kind === "image" && provider.connectionProviderId === id) {
      return [{ ...provider, baseUrl: service.provider.baseUrl, connectionProviderId: undefined }];
    }
    return [provider];
  });
  return {
    providers,
    textProviders,
    videoProviders,
    activeProviderId: providers.some((item) => item.id === snapshot.activeProviderId)
      ? snapshot.activeProviderId
      : (providers[0]?.id ?? ""),
    activeTextProviderId: textProviders.some((item) => item.id === snapshot.activeTextProviderId)
      ? snapshot.activeTextProviderId
      : (textProviders[0]?.id ?? ""),
    activeVideoProviderId: videoProviders.some((item) => item.id === snapshot.activeVideoProviderId)
      ? snapshot.activeVideoProviderId
      : (videoProviders[0]?.id ?? "")
  };
}
