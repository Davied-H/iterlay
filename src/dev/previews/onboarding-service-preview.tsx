import React from "react";
import ReactDOM from "react-dom/client";
import { WelcomeTourStep } from "@/components/onboarding/WelcomeTourStep";
import "@/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WelcomeTourStep
      titleId="preview-title"
      descriptionId="preview-description"
      title="欢迎来到 Iterlay"
      description="先看一遍常用工作流，再进入画板完成第一次生成。"
      reduceMotion
      creditBalance={100}
      licenseState="UNACTIVATED"
      onContinue={() => undefined}
      onConnectProvider={() => undefined}
      onOpenLicense={() => undefined}
    />
  </React.StrictMode>
);
