/** SDK compatibility boundary. Keep external version-specific types out of services. */
export {
  Agent
} from "@mariozechner/pi-agent-core";
export type {
  AgentTool,
  AgentEvent
} from "@mariozechner/pi-agent-core";
export {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  registerFauxProvider
} from "@mariozechner/pi-ai";
export type {
  Context,
  FauxContentBlock,
  FauxResponseFactory
} from "@mariozechner/pi-ai";
