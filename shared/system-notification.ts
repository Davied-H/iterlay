/** IPC channel and target payload for opening a completed generation from a native notification. */
export const GENERATION_NOTIFICATION_OPEN_CHANNEL = "notification:generation:open";

export interface GenerationNotificationTarget {
  boardId: string;
  imagePaths: string[];
}
