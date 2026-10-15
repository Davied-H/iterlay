import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: {}, ipcMain: {} }));
import { allowedExternalUrl, isTrustedRendererUrl } from "../electron/renderer-security";
describe("desktop renderer trust", () => {
  it("allows only the entry document and configured development entry", () => {
    const file = "/tmp/app/dist/index.html";
    expect(isTrustedRendererUrl("file:///tmp/app/dist/index.html?bootTheme=dark", file)).toBe(true);
    expect(isTrustedRendererUrl("file:///tmp/app/dist/other.html", file)).toBe(false);
    expect(isTrustedRendererUrl("http://127.0.0.1:5180/?preview=test", file, "http://127.0.0.1:5180")).toBe(true);
    expect(isTrustedRendererUrl("http://127.0.0.1:5180/evil", file, "http://127.0.0.1:5180")).toBe(false);
    expect(isTrustedRendererUrl("https://example.com", file)).toBe(false);
  });
  it("does not open arbitrary application or local-file protocols", () => {
    expect(allowedExternalUrl("https://example.com")).toBe(true);
    expect(allowedExternalUrl("mailto:hello@example.com")).toBe(true);
    expect(allowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(allowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(allowedExternalUrl("unknown-app://run")).toBe(false);
  });
});
