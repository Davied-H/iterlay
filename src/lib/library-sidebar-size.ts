export const LIBRARY_SIDEBAR_SIZE_STORAGE_KEY = "iterlay.librarySidebarSize";

export const LIBRARY_SIDEBAR_PRESETS = {
  small: 56,
  medium: 208,
  default: 240
} as const;

export const LIBRARY_SIDEBAR_MIN_WIDTH = LIBRARY_SIDEBAR_PRESETS.small;
export const LIBRARY_SIDEBAR_MAX_WIDTH = LIBRARY_SIDEBAR_PRESETS.default;
export const LIBRARY_SIDEBAR_SNAP_ENTER_THRESHOLD = 10;
export const LIBRARY_SIDEBAR_SNAP_EXIT_THRESHOLD = 18;

export type LibrarySidebarPreset = keyof typeof LIBRARY_SIDEBAR_PRESETS;
export type LibrarySidebarMode = LibrarySidebarPreset | "custom";

export interface LibrarySidebarSizePreference {
  width: number;
  mode: LibrarySidebarMode;
}

export interface LibrarySidebarSnapResult extends LibrarySidebarSizePreference {
  lockedPreset: LibrarySidebarPreset | null;
}

export const DEFAULT_LIBRARY_SIDEBAR_SIZE: LibrarySidebarSizePreference = {
  width: LIBRARY_SIDEBAR_PRESETS.default,
  mode: "default"
};

const PRESET_ORDER = Object.keys(LIBRARY_SIDEBAR_PRESETS) as LibrarySidebarPreset[];

export function clampLibrarySidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_LIBRARY_SIDEBAR_SIZE.width;
  return Math.round(Math.min(LIBRARY_SIDEBAR_MAX_WIDTH, Math.max(LIBRARY_SIDEBAR_MIN_WIDTH, width)));
}

export function getLibrarySidebarPreset(width: number): LibrarySidebarPreset | null {
  const normalized = clampLibrarySidebarWidth(width);
  return PRESET_ORDER.find((preset) => LIBRARY_SIDEBAR_PRESETS[preset] === normalized) ?? null;
}

export function createLibrarySidebarPreference(width: number): LibrarySidebarSizePreference {
  const normalized = clampLibrarySidebarWidth(width);
  return {
    width: normalized,
    mode: getLibrarySidebarPreset(normalized) ?? "custom"
  };
}

export function getClosestLibrarySidebarPreset(
  width: number
): LibrarySidebarSizePreference {
  const normalized = clampLibrarySidebarWidth(width);
  const target = PRESET_ORDER
    .map((preset) => ({ preset, width: LIBRARY_SIDEBAR_PRESETS[preset] }))
    .sort((left, right) => {
      const distance = Math.abs(normalized - left.width) - Math.abs(normalized - right.width);
      return distance || right.width - left.width;
    })[0];
  return target
    ? { width: target.width, mode: target.preset }
    : DEFAULT_LIBRARY_SIDEBAR_SIZE;
}

/**
 * Uses separate enter and exit thresholds so a snapped divider does not flicker
 * when the pointer hovers around the edge of a preset's magnetic zone.
 */
export function resolveLibrarySidebarSnap(
  rawWidth: number,
  lockedPreset: LibrarySidebarPreset | null
): LibrarySidebarSnapResult {
  const normalized = clampLibrarySidebarWidth(rawWidth);

  if (lockedPreset) {
    const lockedWidth = LIBRARY_SIDEBAR_PRESETS[lockedPreset];
    if (Math.abs(normalized - lockedWidth) <= LIBRARY_SIDEBAR_SNAP_EXIT_THRESHOLD) {
      return { width: lockedWidth, mode: lockedPreset, lockedPreset };
    }
  }

  const closestPreset = PRESET_ORDER
    .map((preset) => ({ preset, distance: Math.abs(normalized - LIBRARY_SIDEBAR_PRESETS[preset]) }))
    .sort((left, right) => left.distance - right.distance)[0];

  if (closestPreset && closestPreset.distance <= LIBRARY_SIDEBAR_SNAP_ENTER_THRESHOLD) {
    const { preset } = closestPreset;
    return { width: LIBRARY_SIDEBAR_PRESETS[preset], mode: preset, lockedPreset: preset };
  }

  return { width: normalized, mode: "custom", lockedPreset: null };
}

export function getAdjacentLibrarySidebarPreset(
  width: number,
  direction: -1 | 1
): LibrarySidebarSizePreference {
  const normalized = clampLibrarySidebarWidth(width);
  const candidates = PRESET_ORDER
    .map((preset) => ({ preset, width: LIBRARY_SIDEBAR_PRESETS[preset] }))
    .filter((candidate) => direction < 0 ? candidate.width < normalized : candidate.width > normalized);
  const target = direction < 0 ? candidates.at(-1) : candidates[0];
  if (!target) return createLibrarySidebarPreference(normalized);
  return { width: target.width, mode: target.preset };
}

export function readLibrarySidebarSize(
  storage?: Pick<Storage, "getItem">
): LibrarySidebarSizePreference {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    if (!target) return DEFAULT_LIBRARY_SIDEBAR_SIZE;
    const raw = target.getItem(LIBRARY_SIDEBAR_SIZE_STORAGE_KEY);
    if (!raw) return DEFAULT_LIBRARY_SIDEBAR_SIZE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_LIBRARY_SIDEBAR_SIZE;
    const width = (parsed as Partial<LibrarySidebarSizePreference>).width;
    if (!Number.isFinite(width)) return DEFAULT_LIBRARY_SIDEBAR_SIZE;
    return getClosestLibrarySidebarPreset(width as number);
  } catch {
    return DEFAULT_LIBRARY_SIDEBAR_SIZE;
  }
}

export function writeLibrarySidebarSize(
  preference: LibrarySidebarSizePreference,
  storage?: Pick<Storage, "setItem">
): void {
  try {
    const target = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
    target?.setItem(
      LIBRARY_SIDEBAR_SIZE_STORAGE_KEY,
      JSON.stringify(getClosestLibrarySidebarPreset(preference.width))
    );
  } catch {
    // Storage failure only disables cross-session persistence.
  }
}
