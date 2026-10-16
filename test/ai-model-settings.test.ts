import { describe, expect, it } from "vitest";
import {
  connectionOwnerId,
  connectionState,
  modelChoices,
  removeModelService,
  selectDefaultModel,
  upsertModelService,
  type ModelSettingsSnapshot
} from "../src/lib/ai-model-settings";
import type { ProviderConfig, TextProviderConfig, VideoProviderConfig } from "../shared/types";

const image: ProviderConfig = {
  id: "image",
  name: "Images",
  type: "fal",
  baseUrl: "https://queue.fal.run",
  generationEndpoint: "",
  model: "one",
  models: ["one", "two"],
  supportsReferenceImages: true
};
const text: TextProviderConfig = {
  id: "text",
  name: "Assistant",
  type: "openai-compatible",
  baseUrl: "https://fixture.invalid",
  model: "chat"
};
const video: VideoProviderConfig = {
  id: "video",
  name: "Video",
  type: "fal",
  baseUrl: "",
  connectionProviderId: "image",
  model: "movie"
};
function snapshot(): ModelSettingsSnapshot {
  return {
    providers: [image],
    activeProviderId: "image",
    textProviders: [text],
    activeTextProviderId: "text",
    videoProviders: [video],
    activeVideoProviderId: "video"
  };
}

describe("AI model configuration", () => {
  it("selects another model in the same service without changing unrelated persisted configuration", () => {
    const saved = snapshot();
    const result = selectDefaultModel(saved, {
      kind: "image",
      provider: image,
      model: "two"
    });
    expect(result.providers[0].model).toBe("two");
    expect(result.providers[0].models).toEqual(["two", "one"]);
    expect(saved.providers[0].model).toBe("one");
    expect(result.textProviders).toBe(saved.textProviders);
    expect(result.videoProviders).toBe(saved.videoProviders);
    expect(result).not.toHaveProperty("apiKeyByProviderId");
  });
  it("uses the saved provider rather than accepting draft changes from the model choice", () => {
    const saved = snapshot();
    const result = selectDefaultModel(saved, {
      kind: "image",
      provider: {
        ...image,
        name: "Unsaved name",
        baseUrl: "https://draft.invalid"
      },
      model: "two"
    });
    expect(result.providers[0].name).toBe("Images");
    expect(result.providers[0].baseUrl).toBe(image.baseUrl);
  });
  it("enumerates all saved models while preserving a managed assistant with an empty model", () => {
    const saved = snapshot();
    saved.textProviders.push({
      id: "official",
      name: "Built in",
      type: "official",
      baseUrl: "",
      model: ""
    });
    expect(modelChoices(saved, "image").map((choice) => choice.model)).toEqual(["one", "two"]);
    expect(modelChoices(saved, "text").map((choice) => choice.provider.id)).toEqual(["text", "official"]);
    expect(connectionState({ kind: "text", provider: saved.textProviders[1] }, saved, {}, {})).toEqual({
      ready: true,
      reason: "managed"
    });
  });
  it("resolves video credentials from the referenced image service and reports broken references", () => {
    const saved = snapshot();
    expect(connectionOwnerId({ kind: "video", provider: video })).toBe("image");
    expect(connectionState({ kind: "video", provider: video }, saved, { image: true }, {}).ready).toBe(true);
    expect(connectionState({ kind: "video", provider: video }, saved, { video: true }, {}).reason).toBe(
      "missing-key"
    );
    saved.providers = [];
    expect(connectionState({ kind: "video", provider: video }, saved, { image: true }, {}).reason).toBe(
      "missing-connection"
    );
  });
  it("treats expired shared accounts as unavailable even when a key status exists", () => {
    const saved = snapshot();
    const assistant: TextProviderConfig = {
      ...text,
      type: "codex-oauth",
      authProviderId: "account"
    };
    expect(
      connectionState(
        { kind: "text", provider: assistant },
        saved,
        { text: true },
        { account: { state: "expired" } }
      )
    ).toEqual({ ready: false, reason: "login" });
    expect(
      connectionState({ kind: "text", provider: assistant }, saved, {}, { account: { state: "connected" } })
        .ready
    ).toBe(true);
  });
  it("does not merge independent connections with identical platform names", () => {
    const saved = snapshot();
    const result = upsertModelService(saved, {
      kind: "image",
      provider: { ...image, id: "other", name: image.name }
    });
    expect(result.providers.map((provider) => provider.id)).toEqual(["image", "other"]);
    expect(saved.providers).toHaveLength(1);
  });
  it("keeps linked text models and their account login when an image service is removed", () => {
    const saved = snapshot();
    saved.providers.push({ ...image, id: "account", type: "codex-oauth" });
    saved.textProviders.push({
      ...text,
      id: "linked",
      type: "codex-oauth",
      authProviderId: "account"
    });
    saved.activeProviderId = "account";
    saved.activeTextProviderId = "linked";
    const next = removeModelService(saved, {
      kind: "image",
      provider: saved.providers[1]
    });
    expect(next.providers.map((provider) => provider.id)).toEqual(["image"]);
    expect(next.textProviders.map((provider) => provider.id)).toEqual(["text", "linked"]);
    expect(next.activeProviderId).toBe("image");
    expect(next.activeTextProviderId).toBe("linked");
    expect(next.textProviders[1].authProviderId).toBe("account");
    expect(saved.textProviders).toHaveLength(2);
  });
  it("detaches all linked video services while retaining models and the effective URL", () => {
    const saved = snapshot();
    saved.videoProviders.push({ ...video, id: "video-2", model: "movie-2" });
    const next = removeModelService(saved, { kind: "image", provider: image });
    expect(next.providers).toEqual([]);
    expect(next.videoProviders).toEqual([
      { ...video, baseUrl: image.baseUrl, connectionProviderId: undefined },
      { ...video, id: "video-2", model: "movie-2", baseUrl: image.baseUrl, connectionProviderId: undefined }
    ]);
    expect(next.activeVideoProviderId).toBe(saved.activeVideoProviderId);
    expect(saved.videoProviders[0].connectionProviderId).toBe("image");
  });
  it("suppresses automatic text rebinding when deleting a linked Codex text service", () => {
    const saved = snapshot();
    const account = { ...image, id: "account", type: "codex-oauth" as const };
    const linked = { ...text, id: "linked", type: "codex-oauth" as const, authProviderId: "account" };
    saved.providers.push(account);
    saved.textProviders.push(linked);
    const next = removeModelService(saved, { kind: "text", provider: linked });
    expect(next.textProviders.map((provider) => provider.id)).toEqual(["text"]);
    expect(next.providers.find((provider) => provider.id === "account")).toEqual({
      ...account,
      autoBindText: false
    });
    expect(saved.providers[1].autoBindText).toBeUndefined();
    expect(next.videoProviders).toEqual(saved.videoProviders);
  });
});
