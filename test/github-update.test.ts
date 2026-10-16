import { expect,it } from 'vitest';
import { GitHubUpdateApiClient } from '../electron/updater/github-api-client';
it('uses GitHub attachments and checksums without forced updates or device identity',async()=>{
 let requested='';
 const client=new GitHubUpdateApiClient((async(input)=>{requested=String(input);return new Response(JSON.stringify([{draft:false,prerelease:true,tag_name:'v0.1.58',assets:[]},{draft:false,prerelease:false,tag_name:'v0.1.57',body:'Updates',published_at:'2026-10-12',assets:[{name:'Iterlay-0.1.57-arm64.dmg',size:100,browser_download_url:'https://github.com/Davied-H/iterlay/releases/download/v0.1.57/Iterlay-0.1.57-arm64.dmg',digest:'sha256:'+'a'.repeat(64)}]}]));}) as typeof fetch);
 const manifest=await client.fetchLatest({platform:'darwin',arch:'arm64',currentVersion:'0.1.56',deviceId:'secret-device'});
 expect(manifest).toMatchObject({version:'0.1.57',forced:false,sha256:'a'.repeat(64)});expect(requested).not.toContain('secret-device');expect(await client.fetchLatest({platform:'darwin',arch:'x64',currentVersion:'0.1.56'})).toBeNull();
});
it('selects Windows installers for the running CPU architecture', async () => {
 const client = new GitHubUpdateApiClient((async () => new Response(JSON.stringify([{
  draft: false, prerelease: false, tag_name: 'v0.1.59', assets: [
   { name: 'Iterlay-0.1.59-arm64.exe', size: 100, browser_download_url: 'https://example.com/arm64.exe' },
   { name: 'Iterlay-0.1.59-x64.exe', size: 200, browser_download_url: 'https://example.com/x64.exe' }
  ]
 }]))) as typeof fetch);
 expect(await client.fetchLatest({ platform: 'win32', arch: 'arm64', currentVersion: '0.1.58' }))
  .toMatchObject({ arch: 'arm64', downloadUrl: 'https://example.com/arm64.exe' });
 expect(await client.fetchLatest({ platform: 'win32', arch: 'x64', currentVersion: '0.1.58' }))
  .toMatchObject({ arch: 'x64', downloadUrl: 'https://example.com/x64.exe' });
});
