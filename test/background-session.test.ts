import { describe, expect, it, vi } from "vitest";
import { BackgroundSession } from "../electron/background-session.js";

function fixture(background = true) {
  const window = { isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() };
  const dock = vi.fn();
  const session = new BackgroundSession(background, () => window, dock);
  return { session, window, dock };
}

describe("CLI background session", () => {
  it("stays hidden when the service is ready, without stealing focus", () => {
    const f = fixture();
    f.session.markReady();
    expect(f.session.hidden).toBe(true);
    expect(f.window.show).not.toHaveBeenCalled();
    expect(f.window.focus).not.toHaveBeenCalled();
    expect(f.dock).not.toHaveBeenCalled();
  });

  it("remembers an explicit open during startup and promotes the same workspace once ready", () => {
    const f = fixture();
    f.session.requestForeground();
    expect(f.window.show).not.toHaveBeenCalled();
    f.session.markReady();
    expect(f.session.hidden).toBe(false);
    expect(f.window.show).toHaveBeenCalledOnce();
    expect(f.window.restore).toHaveBeenCalledOnce();
    expect(f.window.focus).toHaveBeenCalledOnce();
    expect(f.dock).toHaveBeenCalledOnce();
  });

  it("can reopen a workspace after returning to the background", () => {
    const f = fixture();
    f.session.markReady();
    f.session.requestForeground();
    f.session.returnToBackground();
    expect(f.session.hidden).toBe(true);
    f.session.requestForeground();
    expect(f.window.show).toHaveBeenCalledTimes(2);
  });

  it("preserves ordinary foreground startup", () => {
    const f = fixture(false);
    expect(f.session.hidden).toBe(false);
    f.session.markReady();
    expect(f.window.focus).not.toHaveBeenCalled();
  });
});
