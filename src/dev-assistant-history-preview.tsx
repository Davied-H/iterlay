import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AiAssistant, type AiAssistantMessage } from "@/components/assistant/AiAssistant";
import type { AssistantHistoryConversation } from "@/lib/assistant-history";
import { I18nProvider, useI18n } from "@/i18n";
import "@/styles.css";

const previewLanguage = new URLSearchParams(window.location.search).get("lang");
if (previewLanguage === "zh-CN" || previewLanguage === "en-US") {
  window.localStorage.setItem("iterlay:language", previewLanguage);
}

const conversations: AssistantHistoryConversation[] = [
  {
    id: "current",
    title: "赛博朋克雨夜街头",
    preview: "已加入湿润路面反光和远处车灯的景深层次。",
    updatedAt: new Date().toISOString(),
    exchangeCount: 3,
    messages: [
      { id: "1", role: "user", content: "帮我生成一幅赛博朋克雨夜街头的画面提示词" },
      {
        id: "2",
        role: "assistant",
        content: "可以。我会保留冷色霓虹、湿润路面和电影感低机位。",
        generatedPrompt: [
          "风格：极简黑白手绘涂鸦风，粗线条，白底，幽默轻松",
          "角色：两只戴黑色墨镜的小狗，保持造型和服装一致",
          "分镜 1：大狗认真点头，小狗举爪附和，文案「收到，已装懂」",
          "分镜 2：两狗戴墨镜瘫倒，文案「问题不大，我先躺会儿」",
          "分镜 3：大狗托腮，小狗看着空白处发呆，文案「别慌，我在思考」",
          "排版：每格下方配对应中文文案，画面简单清楚，不要复杂背景"
        ].join("\n")
      }
    ]
  },
  {
    id: "snow",
    title: "雪山中的孤独旅人",
    preview: "主体缩小到画面三分之一处，突出环境尺度。",
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    exchangeCount: 2,
    messages: []
  },
  {
    id: "forest",
    title: "梦幻水彩森林精灵",
    preview: "使用湿画法边缘和低饱和青绿色。",
    updatedAt: new Date(Date.now() - 86_400_000).toISOString(),
    exchangeCount: 4,
    messages: []
  },
  {
    id: "product",
    title: "玻璃香水瓶产品静物",
    preview: "保留透明材质，并减少背景中的装饰元素。",
    updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    exchangeCount: 2,
    messages: []
  }
];

function Preview(): React.ReactElement {
  const { t } = useI18n();
  const [messages, setMessages] = useState<AiAssistantMessage[]>(conversations[0]!.messages);
  const [currentId, setCurrentId] = useState("current");
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f1f2f4] p-8">
      <div className="h-[540px] w-[360px]">
        <AiAssistant
          variant="floating"
          title={t("assistant.title.board")}
          compact
          messages={messages}
          value=""
          history={conversations}
          currentConversationId={currentId}
          onValueChange={() => undefined}
          onSubmit={() => undefined}
          onStop={() => undefined}
          onClose={() => undefined}
          onHistoryOpen={() => undefined}
          onHistorySelect={(conversation) => {
            setCurrentId(conversation.id);
            setMessages(conversation.messages);
          }}
          onNewConversation={() => {
            setCurrentId("new");
            setMessages([{ id: "new", role: "assistant", content: "告诉我你想创作的画面。" }]);
          }}
          onApplyGeneratedPrompt={() => undefined}
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <Preview />
  </I18nProvider>
);
