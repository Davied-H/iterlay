import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  type KeyObject
} from "node:crypto";
import type { CheckInput, DeviceRequest, SignedRequestAuth, SupportedLicensePlatform } from "../../shared/licensing.js";

export interface DeviceFingerprintSource {
  /** Returns stable OS signals. Callers must not persist or transmit the raw values. */
  getStableComponents(): Promise<Readonly<Record<string, string>>>;
}

export interface DeviceFingerprintProvider {
  getDeviceId(): Promise<string>;
}

export class HashedDeviceFingerprintProvider implements DeviceFingerprintProvider {
  constructor(
    private readonly source: DeviceFingerprintSource,
    private readonly productScope = "dev.dong.iterlay"
  ) {}

  async getDeviceId(): Promise<string> {
    const components = await this.source.getStableComponents();
    const entries = Object.entries(components)
      .map(([name, value]) => [name.trim(), value.trim()] as const)
      .filter(([name, value]) => name.length > 0 && value.length > 0)
      .sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) throw new Error("无法获取稳定的设备标识");

    const hash = createHash("sha256");
    appendFramed(hash, this.productScope);
    for (const [name, value] of entries) {
      appendFramed(hash, name);
      appendFramed(hash, value);
    }
    return `dfp_${hash.digest("base64url")}`;
  }
}

export interface DeviceKeyPair {
  publicKey: string;
  privateKey: string;
}

export function generateDeviceKeyPair(): DeviceKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicJwk = publicKey.export({ format: "jwk" });
  if (typeof publicJwk.x !== "string") throw new Error("无法导出设备公钥");
  return {
    publicKey: publicJwk.x,
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  };
}

/**
 * Device public keys are stored and transmitted as the canonical 32-byte
 * Ed25519 JWK x value encoded with unpadded base64url. The private key only
 * needs to be a parseable Ed25519 private key whose derived public key matches;
 * harmless PEM whitespace and line-ending differences are accepted.
 */
export function isCanonicalDeviceKeyPair(pair: DeviceKeyPair): boolean {
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(pair.publicKey)) return false;
    const storedPublicKey = Buffer.from(pair.publicKey, "base64url");
    if (storedPublicKey.length !== 32 || storedPublicKey.toString("base64url") !== pair.publicKey) return false;

    const privateKey = createPrivateKey(pair.privateKey);
    if (privateKey.asymmetricKeyType !== "ed25519") return false;

    const derivedPublicJwk = createPublicKey(privateKey).export({ format: "jwk" });
    if (typeof derivedPublicJwk.x !== "string") return false;
    const derivedPublicKey = Buffer.from(derivedPublicJwk.x, "base64url");
    return derivedPublicKey.length === 32 && timingSafeEqual(storedPublicKey, derivedPublicKey);
  } catch {
    return false;
  }
}

export interface DeviceRegistrationOptions {
  fingerprintProvider: DeviceFingerprintProvider;
  devicePublicKey: string;
  platform: SupportedLicensePlatform;
  appVersion: string;
  deviceName?: string;
}

export async function createDeviceRequest(options: DeviceRegistrationOptions): Promise<DeviceRequest> {
  return {
    deviceFingerprint: await options.fingerprintProvider.getDeviceId(),
    devicePublicKey: options.devicePublicKey,
    ...(options.deviceName ? { deviceName: options.deviceName } : {}),
    platform: options.platform,
    appVersion: options.appVersion
  };
}

export function createCheckProofMessage(nonce: string, grant: string, appVersion: string): string {
  return `${nonce}\n${grant}\n${appVersion}`;
}

export function createCheckInput(
  grant: string,
  appVersion: string,
  devicePrivateKey: KeyObject | string | Buffer,
  nonce = randomBytes(24).toString("base64url")
): CheckInput {
  if (!nonce) throw new TypeError("nonce 不能为空");
  const message = createCheckProofMessage(nonce, grant, appVersion);
  const proof = sign(null, Buffer.from(message, "utf8"), devicePrivateKey).toString("base64url");
  return { grant, nonce, proof, appVersion };
}

export function createSignedRequestAuth(
  grant: string,
  appVersion: string,
  purpose: string,
  payload: string | Buffer,
  devicePrivateKey: KeyObject | string | Buffer,
  nonce = randomBytes(24).toString("base64url")
): SignedRequestAuth {
  if (!nonce) throw new TypeError("nonce 不能为空");
  if (!purpose) throw new TypeError("purpose 不能为空");
  const bodyHash = createHash("sha256").update(payload).digest("hex");
  const message = `${nonce}\n${grant}\n${appVersion}\n${purpose}\n${bodyHash}`;
  const proof = sign(null, Buffer.from(message, "utf8"), devicePrivateKey).toString("base64url");
  return { grant, nonce, proof, appVersion, purpose, bodyHash };
}

function appendFramed(hash: ReturnType<typeof createHash>, value: string): void {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length);
  hash.update(length);
  hash.update(bytes);
}
