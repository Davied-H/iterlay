export type BoardSaveState = "saved" | "pending" | "saving" | "failed";

/** Coalesces changes without marking failed writes as persisted. */
export class BoardSaveCoordinator {
  private revision = 0;
  private persisted = 0;
  private savingRevision: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private task: Promise<void> | null = null;
  state: BoardSaveState = "saved";

  constructor(
    private readonly save: () => Promise<void>,
    private readonly notify: (state: BoardSaveState, error?: unknown) => void = () => undefined,
    private readonly delayMs = 800
  ) {}

  get pending(): Promise<void> | null { return this.task; }
  get dirty(): boolean { return this.revision > this.persisted; }
  get scheduled(): boolean { return this.timer !== null; }

  schedule(): void {
    this.revision += 1;
    this.setState("pending");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(() => undefined);
    }, this.delayMs);
  }

  async saveNow(): Promise<void> {
    this.revision += 1;
    await this.flush();
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.task) return this.task;
    if (!this.dirty) return Promise.resolve();
    const task = this.drain();
    this.task = task;
    void task.finally(() => {
      if (this.task === task) this.task = null;
    }).catch(() => undefined);
    return task;
  }

  /** External mutations/deletions invalidate queued renderer snapshots. */
  discardPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.revision = this.savingRevision ?? this.persisted;
    if (!this.task) this.setState("saved");
  }

  private async drain(): Promise<void> {
    try {
      while (this.dirty) {
        const revision = this.revision;
        this.savingRevision = revision;
        this.setState("saving");
        await this.save();
        this.persisted = revision;
        this.savingRevision = null;
      }
      this.setState("saved");
    } catch (error) {
      this.savingRevision = null;
      this.setState("failed", error);
      throw error;
    }
  }

  private setState(state: BoardSaveState, error?: unknown): void {
    this.state = state;
    this.notify(state, error);
  }
}
