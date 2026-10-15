import { describe, expect, it } from "vitest";
import { DEV_BROWSER_ATTACHMENT_THRESHOLD, decodeDevBrowserWire, encodeDevBrowserWire } from "../shared/dev-browser-wire.js";

const roundTrip = (value: unknown): unknown => decodeDevBrowserWire(JSON.parse(JSON.stringify(encodeDevBrowserWire(value))));

describe("development browser wire codec", () => {
  it("preserves undefined, ArrayBuffer and sliced Uint8Array values inside requests", () => {
    const bytes = new Uint8Array([0, 1, 127, 255]);
    const decoded = roundTrip({
      args: [undefined, bytes.buffer, bytes.subarray(1, 3)],
      optional: undefined
    }) as { args: [undefined, ArrayBuffer, Uint8Array]; optional: undefined };
    expect(Object.hasOwn(decoded, "optional")).toBe(true);
    expect(decoded.optional).toBeUndefined();
    expect(decoded.args[0]).toBeUndefined();
    expect(decoded.args[1]).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(decoded.args[1])).toEqual(bytes);
    expect(decoded.args[2]).toBeInstanceOf(Uint8Array);
    expect(decoded.args[2]).toEqual(new Uint8Array([1, 127]));
  });

  it("keeps marker-shaped user objects intact and requires an exact binary marker", () => {
    const marker = { __iterlayDevWire: "ArrayBuffer", data: "AA==" };
    expect(roundTrip(marker)).toEqual(marker);
    const extra = { ...marker, imagePath: "/an/ordinary/asset" };
    expect(decodeDevBrowserWire(extra)).toEqual(extra);
    const invalid = { ...marker, data: "not base64" };
    expect(decodeDevBrowserWire(invalid)).toEqual(invalid);
    const fakeUndefined = { __iterlayDevWire: "undefined", text: "a user value" };
    expect(decodeDevBrowserWire(fakeUndefined)).toEqual(fakeUndefined);
  });

  it("transfers large media without exceeding argument or regular-expression stack limits", () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 1);
    bytes[0] = 255;
    bytes[bytes.length - 1] = 127;
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it("preserves object keys without changing the output prototype", () => {
    const original = JSON.parse('{"__proto__":{"polluted":true},"value":1}');
    const decoded = roundTrip(original) as object;
    expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(decoded).toEqual(original);
  });

  it("keeps large binary data in attachments and preserves mixed binary types and sliced views", () => {
    const buffer = new Uint8Array(DEV_BROWSER_ATTACHMENT_THRESHOLD);
    buffer[0] = 255;
    const source = new Uint8Array(DEV_BROWSER_ATTACHMENT_THRESHOLD + 4);
    source.fill(99);
    source[1] = 1;
    source[source.length - 2] = 127;
    const view = source.subarray(1, source.length - 1);
    const attachments: ArrayBuffer[] = [];
    const original = { args: [buffer.buffer, view, new Uint8Array([1, 2, 3]), undefined] };
    const encoded = encodeDevBrowserWire(original, (bytes) => {
      attachments.push(bytes.slice().buffer);
      return attachments.length - 1;
    });
    const serialized = JSON.stringify(encoded);
    expect(serialized.length).toBeLessThan(256);
    expect(attachments).toHaveLength(2);
    expect(attachments.map((bytes) => bytes.byteLength)).toEqual([buffer.byteLength, view.byteLength]);

    const decoded = decodeDevBrowserWire(JSON.parse(serialized), (index) => attachments[index]) as {
      args: [ArrayBuffer, Uint8Array, Uint8Array, undefined];
    };
    expect(decoded.args[0]).toBeInstanceOf(ArrayBuffer);
    expect(Buffer.from(decoded.args[0]).equals(Buffer.from(buffer))).toBe(true);
    expect(decoded.args[1]).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(decoded.args[1]).equals(Buffer.from(view))).toBe(true);
    expect(decoded.args[2]).toEqual(new Uint8Array([1, 2, 3]));
    expect(decoded.args[3]).toBeUndefined();
  });

  it("requires exact attachment markers and rejects missing attachments", () => {
    const marker = { __iterlayDevWire: "ArrayBuffer", attachment: 0 };
    expect(() => decodeDevBrowserWire(marker)).toThrow("附件不存在");
    expect(() => decodeDevBrowserWire(marker, () => undefined)).toThrow("附件不存在");
    const data = new ArrayBuffer(1);
    expect(decodeDevBrowserWire(marker, () => data)).toBe(data);
    expect(roundTrip(marker)).toEqual(marker);
    for (const invalid of [
      { ...marker, attachment: -1 },
      { ...marker, attachment: 0.5 },
      { ...marker, attachment: "0" },
      { ...marker, attachment: Number.MAX_SAFE_INTEGER + 1 },
      { ...marker, text: "an ordinary user value" }
    ]) expect(decodeDevBrowserWire(invalid, () => data)).toEqual(invalid);
  });
});
