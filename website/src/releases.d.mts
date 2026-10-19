export interface GitHubReleaseAsset {
  id: number;
  name: string;
  browser_download_url: string;
}
export interface GitHubRelease {
  id: number;
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
  published_at: string;
  body: string | null;
  html_url: string;
  assets: GitHubReleaseAsset[];
}
export type InstallerVariant = "darwin-arm64" | "darwin-x64" | "win32-x64" | "win32-arm64";
export const repository: string;
export const releasesUrl: string;
export function releaseNoteParts(body: string): { text: string; href?: string }[];
export function installerVariant(name: string): InstallerVariant | null;
export function releaseInstallers(releases: readonly GitHubRelease[], variant: InstallerVariant): { release: GitHubRelease; asset: GitHubReleaseAsset }[];
export function loadReleases(signal?: AbortSignal): Promise<GitHubRelease[]>;
