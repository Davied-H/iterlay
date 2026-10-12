import { createContext, useContext } from "react";
import type { LicenseState, LicenseStatusSnapshot } from "@shared/licensing";

export interface LicenseContextValue {
  status: LicenseStatusSnapshot | null;
  busy: boolean;
  openCenter: () => void;
  openActivation?: () => void;
  startupError?: string;
  retryStatus?: () => void;
}

export const LicenseContext = createContext<LicenseContextValue | null>(null);

export function useLicense(): LicenseContextValue {
  const value = useContext(LicenseContext);
  if (!value) throw new Error("useLicense must be used within LicenseGate");
  return value;
}

export function getLicenseStatusLabel(state: LicenseState | null): string {
  switch (state) {
    case "UNACTIVATED":
      return "未激活";
    case "TRIAL_ACTIVE":
      return "试用中";
    case "LICENSED":
      return "已授权";
    case "OFFLINE_GRACE":
      return "需联网复核";
    case "RESTRICTED":
      return "只读模式";
    case "REVOKED":
      return "授权已停用";
    case "VERSION_BLOCKED":
      return "版本不受支持";
    case "UPDATE_REQUIRED":
      return "必须更新";
    default:
      return "授权不可用";
  }
}
