import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ call: vi.fn(), resolve: vi.fn(), spawn: vi.fn() }));
vi.mock("../electron/local-api-client.js", () => ({ callLocalApi: mocks.call }));
vi.mock("../cli/src/paths.js", () => ({ resolveIterlayApp: mocks.resolve }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
import { connect } from "../cli/src/runtime.js";

afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

describe("CLI service connection", () => {
  it("reuses a running service without launching or foregrounding the App", async () => {
    mocks.call.mockResolvedValue(true);
    const call = await connect({ userDataPath: "/workspace" });
    await call("list_boards");
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.call.mock.calls.map((args) => args[1])).toEqual(["status", "list_boards"]);
  });

  it("launches a detached hidden service and probes readiness without retrying mutations", async () => {
    vi.useFakeTimers();
    mocks.call.mockRejectedValueOnce(new Error("not running")).mockResolvedValue(true);
    mocks.resolve.mockResolvedValue({ commandPath: "/Applications/Iterlay.app/Contents/MacOS/Iterlay" });
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    const pending = connect({ userDataPath: "/workspace" });
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    child.emit("spawn");
    await vi.advanceTimersByTimeAsync(250);
    const call = await pending;
    expect(mocks.spawn).toHaveBeenCalledWith(expect.any(String), ["--iterlay-background"], expect.objectContaining({ detached: true, windowsHide: true, stdio: "ignore" }));
    expect(child.unref).toHaveBeenCalledOnce();
    expect(mocks.call.mock.calls.every((args) => args[1] === "status")).toBe(true);
    await call("generate_image", { prompt: "test" });
    expect(mocks.call.mock.calls.filter((args) => args[1] === "generate_image")).toHaveLength(1);
  });

  it("honors no-launch for an unavailable workspace", async () => {
    mocks.call.mockRejectedValue(new Error("not running"));
    await expect(connect({ userDataPath: "/workspace", noLaunch: true })).rejects.toThrow("not running");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
