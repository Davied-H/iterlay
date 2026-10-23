import type { AiAssistantProps } from "./assistant-types";
import { AssistantChat } from "./AssistantChat";
export type * from "./assistant-types";
export { AssistantImageContext } from "./AssistantCards";

/** All assistant surfaces share one conversation implementation. */
export function AiAssistant(props: AiAssistantProps): React.ReactElement {
  return <AssistantChat {...props} />;
}
