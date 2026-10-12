import { freeAccessStatus } from '../../shared/free-access.js';
import type { LicenseStatusSnapshot,SignedRequestAuth } from '../../shared/licensing.js';
/** Local access only. No stored grant, fingerprint, clock checks or licensing server. */
export class LicenseService {
  constructor(options?: unknown) { void options; }
  async initialize(): Promise<LicenseStatusSnapshot> { return this.getStatus(); }
  getStatus(): LicenseStatusSnapshot { return freeAccessStatus(); }
  async getDeviceId(): Promise<string> { return 'open-source'; }
  markCredentialRejected(message?: string): LicenseStatusSnapshot { void message; return this.getStatus(); }
  async startTrial(): Promise<LicenseStatusSnapshot> { return this.getStatus(); }
  async activate(email: string, key: string): Promise<LicenseStatusSnapshot> { void email; void key; return this.getStatus(); }
  async checkNow(): Promise<LicenseStatusSnapshot> { return this.getStatus(); }
  async deactivateCurrentDevice(): Promise<LicenseStatusSnapshot> { return this.getStatus(); }
  assertCapability(capability: string): void { void capability; }
  async ensureCapability(capability: string, startTrial = false): Promise<void> { void capability; void startTrial; }
  async createSignedRequest(_purpose: string, _payload: string | Buffer): Promise<SignedRequestAuth> {
    void _purpose; void _payload;
    throw new Error('开源版不提供商业托管服务，请配置自己的 AI 服务商。');
  }
}
