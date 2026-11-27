/** A transport registers existing command handlers without emulating Electron IPC. */
// Handlers retain their individual typed arguments at registration boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CommandRegistrar = (channel: string, handler: (event: unknown, ...args: any[]) => unknown) => void;
