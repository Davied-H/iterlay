import type { UpdateApiClient, UpdateCheckQuery } from './api-client.js';
import type { UpdateManifest } from '../../shared/app-update.js';
interface GitHubRelease { tag_name: string; draft: boolean; prerelease: boolean; published_at: string; body: string; assets: { name:string; browser_download_url:string; size:number; digest?:string }[] }
export class GitHubUpdateApiClient implements UpdateApiClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async fetchLatest(query: UpdateCheckQuery): Promise<UpdateManifest | null> {
    const response = await this.fetcher('https://api.github.com/repos/Davied-H/iterlay/releases?per_page=100', { headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('无法读取 GitHub Releases，请稍后重试。');
    const releases = await response.json() as GitHubRelease[];
    for (const release of releases) {
      if (release.draft || (query.channel !== 'beta' && release.prerelease)) continue;
      const version = release.tag_name.replace(/^v/, '');
      if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
      const asset = release.assets.find(a => query.platform === 'darwin'
        ? a.name.endsWith(`-${query.arch}.dmg`)
        : /\.exe$/i.test(a.name) && !/arm64|ia32/i.test(a.name) && query.arch === 'x64');
      if (!asset) continue;
      return { version,platform:query.platform,arch:query.arch,channel:release.prerelease?'beta':'stable',downloadUrl:asset.browser_download_url,fileSize:asset.size,sha256:asset.digest?.startsWith('sha256:')?asset.digest.slice(7):undefined,releaseNotes:release.body,publishedAt:release.published_at,forced:false };
    }
    return null;
  }
}
