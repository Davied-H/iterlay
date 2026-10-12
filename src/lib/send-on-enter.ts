interface SendEnterEvent {
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
  };
}

export function isSendEnter(event: SendEnterEvent): boolean {
  return event.key === "Enter"
    && !event.shiftKey
    && !event.isComposing
    && !event.nativeEvent?.isComposing;
}
