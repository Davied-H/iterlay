import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { HttpActivationApiClient } from "../electron/licensing/api-client.js";
import {
  createCheckInput,
  createCheckProofMessage,
  createSignedRequestAuth,
  generateDeviceKeyPair,
  HashedDeviceFingerprintProvider,
  isCanonicalDeviceKeyPair
} from "../electron/licensing/device.js";

describe("licensing device and API contracts", () => {
  it("creates a stable fingerprint independent of component order without exposing raw signals", async () => {
    const first = new HashedDeviceFingerprintProvider({
      getStableComponents: async () => ({ machineGuid: "machine-secret", platform: "darwin" })
    });
    const second = new HashedDeviceFingerprintProvider({
      getStableComponents: async () => ({ platform: "darwin", machineGuid: "machine-secret" })
    });
    const firstId = await first.getDeviceId();
    expect(await second.getDeviceId()).toBe(firstId);
    expect(firstId).toMatch(/^dfp_[A-Za-z0-9_-]{43}$/);
    expect(firstId).not.toContain("machine-secret");
  });

  it("signs check proof over the exact backend message contract", () => {
    const pair = generateDeviceKeyPair();
    expect(Buffer.from(pair.publicKey, "base64url")).toHaveLength(32);
    const input = createCheckInput("header.payload.signature", "1.2.3", pair.privateKey, "fixed-nonce");
    expect(createCheckProofMessage(input.nonce, input.grant, input.appVersion)).toBe(
      "fixed-nonce\nheader.payload.signature\n1.2.3"
    );
    expect(
      verify(
        null,
        Buffer.from(createCheckProofMessage(input.nonce, input.grant, input.appVersion)),
        createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: pair.publicKey }, format: "jwk" }),
        Buffer.from(input.proof, "base64url")
      )
    ).toBe(true);
  });

  it("signs official requests over purpose and exact payload hash", () => {
    const pair = generateDeviceKeyPair();
    const payload = JSON.stringify({ prompt: "hello" });
    const auth = createSignedRequestAuth(
      "header.payload.signature",
      "1.2.3",
      "official.images.generate",
      payload,
      pair.privateKey,
      "fixed-request-nonce"
    );
    expect(auth.bodyHash).toBe("8a44725210b9dcd4fefd9f0eca07b70ae45e69274a3105fb25eb426a2cf8bbf4");
    const message = `${auth.nonce}\n${auth.grant}\n${auth.appVersion}\n${auth.purpose}\n${auth.bodyHash}`;
    expect(
      verify(
        null,
        Buffer.from(message),
        createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: pair.publicKey }, format: "jwk" }),
        Buffer.from(auth.proof, "base64url")
      )
    ).toBe(true);
  });

  it("accepts only canonical raw Ed25519 public keys that match the private key", () => {
    const pair = generateDeviceKeyPair();
    expect(isCanonicalDeviceKeyPair(pair)).toBe(true);

    const otherPair = generateDeviceKeyPair();
    expect(isCanonicalDeviceKeyPair({ publicKey: otherPair.publicKey, privateKey: pair.privateKey })).toBe(false);

    const { publicKey } = generateKeyPairSync("ed25519");
    expect(
      isCanonicalDeviceKeyPair({
        publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
        privateKey: pair.privateKey
      })
    ).toBe(false);
    expect(isCanonicalDeviceKeyPair({ publicKey: pair.publicKey, privateKey: `${pair.privateKey}\n` })).toBe(true);
    expect(
      isCanonicalDeviceKeyPair({ publicKey: pair.publicKey, privateKey: pair.privateKey.replaceAll("\n", "\r\n") })
    ).toBe(true);
    expect(isCanonicalDeviceKeyPair({ publicKey: "not-a-key", privateKey: "not-a-key" })).toBe(false);
  });

  it("maps activation calls directly onto the versioned HTTP API", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          grant: "header.payload.signature",
          state: "LICENSED",
          serverTime: "2026-07-16T00:00:00.000Z",
          license: { email: "buyer@example.com" },
          device: { createdAt: "2026-07-15T08:30:00.000Z" }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new HttpActivationApiClient("https://license.example.com/api/v1/", fetcher);
    const input = {
      email: "buyer@example.com",
      licenseKey: "ITER-TEST",
      deviceFingerprint: "dfp_test",
      devicePublicKey: "public-key",
      platform: "darwin" as const,
      appVersion: "1.2.3"
    };
    await expect(client.activateLicense(input)).resolves.toMatchObject({
      state: "LICENSED",
      license: { email: "buyer@example.com" },
      device: { createdAt: "2026-07-15T08:30:00.000Z" }
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://license.example.com/api/v1/activations/activate",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) })
    );
  });

  it("creates a short-lived portal link from a signed device check", async () => {
    const link = {
      url: "https://iterlay.example/portal?token=one-time-token",
      expiresAt: "2026-07-22T08:02:00.000Z"
    };
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(link), { status: 201, headers: { "Content-Type": "application/json" } })
    );
    const client = new HttpActivationApiClient("https://license.example.com/api/v1/", fetcher);
    const input = { grant: "header.payload.signature", nonce: "a-secure-random-nonce", proof: "proof", appVersion: "1.2.3" };

    await expect(client.createPortalDeviceLink(input)).resolves.toEqual(link);
    expect(fetcher).toHaveBeenCalledWith(
      "https://license.example.com/api/v1/portal/device-links",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) })
    );
  });

  it("accepts the forced update grant response contract", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          grant: "header.payload.signature",
          state: "UPDATE_REQUIRED",
          serverTime: "2026-07-20T00:00:00.000Z",
          update: {
            required: true,
            forced: true,
            targetVersion: "1.2.4",
            minimumVersion: "1.2.4",
            latestVersion: "1.2.4",
            downloadUrl: "https://iterlay.example/download"
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new HttpActivationApiClient("https://license.example.com/api/v1/", fetcher);
    await expect(client.startTrial({
      deviceFingerprint: "dfp_test",
      devicePublicKey: "public-key",
      platform: "darwin",
      appVersion: "1.2.3"
    })).resolves.toMatchObject({
      state: "UPDATE_REQUIRED",
      update: { forced: true, targetVersion: "1.2.4" }
    });
  });
});
