import type { AssistantConversationMessage } from "@shared/types";

/** Let the model interpret the full request; keywords are a legacy-response fallback. */
export function resolveCreateChatMediaType(
  conversation: AssistantConversationMessage[],
  instruction: string,
  suggested?: "image" | "video"
): "image" | "video" {
  if (suggested) return suggested;
  for (const content of [instruction, ...conversation.filter((message) => message.role === "user").map((message) => message.content).reverse()]) {
    if (/(?:视频|短片|动画|video|animation)\s*(?:的)?\s*(?:封面|海报|缩略图|cover|poster|thumbnail)|(?:改成|只要|生成|做|create|generate)\s*(?:一张|张|an?\s+)?\s*(?:图片|照片|插画|海报|image|photo|poster)/iu.test(content)) return "image";
    if (/(?:视频|短片|动画|video|animation)/iu.test(content) && !/(?:不要|不做|不用|no\s+)(?:生成)?\s*(?:视频|短片|动画|video|animation)/iu.test(content)) return "video";
  }
  return suggested ?? "image";
}
