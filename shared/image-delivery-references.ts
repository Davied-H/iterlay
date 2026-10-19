import type { ImageDeliveryRecipe, ImageVersionIdentity } from "./image-delivery.js";

/** Keep the always-available version separation guard independent of the delivery editor. */
export function hasDeliveryReferencesToMovedVersions(
  recipes: readonly ImageDeliveryRecipe[] | undefined,
  nodeId: string,
  movedVersions?: readonly ImageVersionIdentity[]
): boolean {
  return (recipes ?? []).some((recipe) => recipe.items.some((item) => item.nodeId === nodeId && (
    movedVersions === undefined || movedVersions.some((version) => version.imagePath === item.sourceVersion.imagePath && version.jobId === item.sourceVersion.jobId)
  )));
}
