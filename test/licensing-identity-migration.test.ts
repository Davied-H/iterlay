import { describe,expect,it,vi } from 'vitest';
import { LicenseService } from '../electron/licensing/service';
describe('permanent free local access', () => {
  it('starts with every capability without touching a licensing server or persisted grant', async () => {
    const api = { startTrial:vi.fn(),checkActivation:vi.fn() };
    const license = new LicenseService({ dataDir:'/does-not-exist',apiClient:api });
    expect((await license.initialize()).capabilities).toMatchObject({mode:'full',canGenerate:true,canEdit:true,canImport:true,canExport:true,canActivate:false,canStartTrial:false});
    await license.ensureCapability('generate',true);
    await license.ensureCapability('edit');
    license.assertCapability('import');
    expect(api.startTrial).not.toHaveBeenCalled(); expect(api.checkActivation).not.toHaveBeenCalled();
  });
  it('remains free after legacy activation, deactivation and credential rejection calls', async () => {
    const service = new LicenseService();
    await service.activate('',''); await service.deactivateCurrentDevice(); service.markCredentialRejected();
    expect(await service.checkNow()).toMatchObject({reason:'free_open_source',state:'LICENSED',capabilities:{mode:'full'}});
    expect(service.getStatus().offlineValidUntil).toBeUndefined();
    await expect(service.createSignedRequest('credits.status','{}')).rejects.toThrow('商业托管服务');
  });
});
