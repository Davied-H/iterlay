import { useEffect, type ReactNode } from "react";
import { useI18n } from "./index";
import { localizeLegacyText } from "./legacy-messages";

const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"]);

function translateElement(root: Node, locale: "zh-CN" | "en-US"): void {
  const translateTextNode = (node: Text): void => {
    const parent = node.parentElement;
    if (!parent || SKIPPED_TAGS.has(parent.tagName)) return;
    const next = localizeLegacyText(node.data, locale);
    if (next !== node.data) node.data = next;
  };

  const translateAttributes = (element: Element): void => {
    if (SKIPPED_TAGS.has(element.tagName)) return;
    TRANSLATABLE_ATTRIBUTES.forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const next = localizeLegacyText(value, locale);
      if (next !== value) element.setAttribute(attribute, next);
    });
  };

  if (root.nodeType === Node.TEXT_NODE) translateTextNode(root as Text);
  if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root as Element);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) translateTextNode(current as Text);
    else translateAttributes(current as Element);
    current = walker.nextNode();
  }
}

export function LegacyI18nBridge({ children }: { children: ReactNode }): React.ReactElement {
  const { locale } = useI18n();

  useEffect(() => {
    translateElement(document.body, locale);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          translateElement(mutation.target, locale);
          return;
        }
        if (mutation.type === "attributes") {
          translateElement(mutation.target, locale);
          return;
        }
        mutation.addedNodes.forEach((node) => translateElement(node, locale));
      });
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES]
    });
    return () => observer.disconnect();
  }, [locale]);

  return <>{children}</>;
}
