import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect,it,vi } from 'vitest';
import { SettingsStore as CommunitySettingsStore } from '../electron/storage/settings-store';
vi.mock('electron',()=>({safeStorage:{isEncryptionAvailable:()=>true,decryptString:(b:Buffer)=>b.toString()}}));
it('fresh installs offer only self-configured providers', async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'iterlay-free-'));
 try{const settings=new CommunitySettingsStore(dir).getSettings();for(const list of [settings.providers,settings.textProviders,settings.videoProviders])expect(list.every(p=>p.type!=='official')).toBe(true);expect(settings.providers.some(p=>p.id===settings.activeProviderId)).toBe(true);}finally{await rm(dir,{recursive:true,force:true});}
});
it('migrates official connections while preserving custom provider and API key', async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'iterlay-free-'));
 try{await writeFile(path.join(dir,'settings.json'),JSON.stringify({providers:[{id:'custom',name:'Private AI',type:'openai-compatible',baseUrl:'https://example.com',model:'example'}],activeProviderId:'iterlay-official',encryptedApiKeys:{custom:Buffer.from('test-key').toString('base64')},theme:'system'}));const store=new CommunitySettingsStore(dir);const settings=store.getSettings();expect(settings.activeProviderId).toBe('custom');expect(settings.providers.map(p=>p.id)).toContain('custom');expect(store.getApiKey('custom')).toBe('test-key');expect(settings.providers.some(p=>p.type==='official')).toBe(false);}finally{await rm(dir,{recursive:true,force:true});}
});
