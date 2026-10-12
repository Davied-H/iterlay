import React from "react";
import ReactDOM from "react-dom/client";
import { LicenseGate } from "./components/licensing/LicenseGate";
import { RootErrorBoundary } from "./components/system/RootErrorBoundary";
import { StartupLoading } from "./components/system/StartupLoading";
import { I18nProvider } from "./i18n";
import { LegacyI18nBridge } from "./i18n/LegacyI18nBridge";
import "./styles.css";

const Workspace = React.lazy(async () => {
  const [{ default: App }, { UpdateManager }] = await Promise.all([
    import("./App"),
    import("./components/update/UpdateManager")
  ]);
  return {
    default: function WorkspaceRuntime(): React.ReactElement {
      return <UpdateManager><App /></UpdateManager>;
    }
  };
});

performance.mark("iterlay:react-bootstrap-start");
const bootTheme = new URLSearchParams(window.location.search).get("bootTheme");
document.documentElement.classList.toggle("dark", bootTheme === "dark");
document.documentElement.classList.remove("boot-dark", "boot-light");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <LegacyI18nBridge>
        <RootErrorBoundary>
          <LicenseGate>
            <React.Suspense fallback={<StartupLoading />}>
              <Workspace />
            </React.Suspense>
          </LicenseGate>
        </RootErrorBoundary>
      </LegacyI18nBridge>
    </I18nProvider>
  </React.StrictMode>
);

requestAnimationFrame(() => performance.mark("iterlay:react-first-frame"));
