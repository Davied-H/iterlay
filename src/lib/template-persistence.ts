import type { ImageWorkbenchApi } from "@shared/workbench-client";
import type { SceneTemplateData } from "@shared/types";

let api: ImageWorkbenchApi | undefined;
let pending: Promise<unknown> = Promise.resolve();
let reportError: (error: unknown) => void = () => undefined;
/** Serialize migration and UI deltas. Backend checks each changed template against its old value. */
export function connectTemplatePersistence(client: ImageWorkbenchApi, legacy: SceneTemplateData[], onError: (error: unknown) => void, migrate = true): Promise<SceneTemplateData[]> {
  api = client;
  reportError = onError;
  const migration = pending.then(() => migrate ? client.syncTemplates([], legacy, true) : client.listTemplates());
  pending = migration.catch(onError);
  return migration;
}
export function persistTemplateChanges(previous: SceneTemplateData[], next: SceneTemplateData[]): void {
  const client = api;
  if (!client) return;
  const commit = pending.then(() => client.syncTemplates(previous, next));
  pending = commit.catch(reportError);
}
export async function readPersistedTemplates(): Promise<SceneTemplateData[] | undefined> {
  await pending;
  return api?.listTemplates();
}
