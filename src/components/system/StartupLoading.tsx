import { useUiText } from "@/i18n";
import "./startup-loading.css";

interface StartupLoadingProps {
  label?: string;
  error?: string;
  onRetry?: () => void;
}

export function StartupLoading({
  label = "正在打开 Iterlay",
  error,
  onRetry
}: StartupLoadingProps): React.ReactElement {
  const uiText = useUiText();

  return (
    <div className={`license-loading${error ? " license-loading--error" : ""}`} role="status" aria-live="polite">
      <StartupMark />
      <div className="license-loading__copy">
        <strong>Iterlay</strong>
        {error ? <span className="license-loading__error">{error}</span> : <span className="sr-only">{label}</span>}
      </div>
      {error && onRetry ? (
        <button className="license-loading__retry" type="button" onClick={onRetry}>{uiText("重试")}</button>
      ) : null}
    </div>
  );
}

function StartupMark(): React.ReactElement {
  return (
    <div className="license-loading__mark" role="img" aria-label="Iterlay">
      <svg className="license-loading__shadow" viewBox="0 0 120 108" aria-hidden>
        <ellipse cx="56" cy="101" rx="30" ry="3.5" />
      </svg>
      <span className="license-loading__layer license-loading__layer--top">
        <svg viewBox="0 0 120 108" aria-hidden>
          <path className="license-loading__edge" d="M56 8h50L86 32H36L56 8Z" />
          <path className="license-loading__face" d="M56 4h50L86 28H36L56 4Z" />
        </svg>
      </span>
      <span className="license-loading__layer license-loading__layer--middle">
        <svg viewBox="0 0 120 108" aria-hidden>
          <path className="license-loading__edge" d="M36 42h50L66 66H16l20-24Z" />
          <path className="license-loading__face" d="M36 38h50L66 62H16l20-24Z" />
        </svg>
      </span>
      <span className="license-loading__layer license-loading__layer--bottom">
        <svg viewBox="0 0 120 108" aria-hidden>
          <path className="license-loading__edge" d="M16 76h50l-20 24H0l16-19.2V76Z" />
          <path className="license-loading__face" d="M16 72h50L46 96H0l16-19.2V72Z" />
        </svg>
      </span>
    </div>
  );
}
