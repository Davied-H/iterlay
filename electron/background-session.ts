export const CLI_BACKGROUND_FLAG = "--iterlay-background";

interface SessionWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

/** A foreground request during startup is remembered until the workspace is ready. */
export class BackgroundSession {
  private foreground: boolean;
  private ready = false;
  constructor(
    readonly startedInBackground: boolean,
    private readonly getWindow: () => SessionWindow | undefined,
    private readonly showDock: () => void
  ) {
    this.foreground = !startedInBackground;
  }

  get hidden(): boolean { return !this.foreground; }

  requestForeground(): void {
    this.foreground = true;
    if (!this.ready) return;
    const window = this.getWindow();
    if (!window || window.isDestroyed()) return;
    this.showDock();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  markReady(): void {
    this.ready = true;
    if (this.startedInBackground && this.foreground) this.requestForeground();
  }

  returnToBackground(): void { this.foreground = false; }

  didShow(): void { this.foreground = true; this.showDock(); }
}
