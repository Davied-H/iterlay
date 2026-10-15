import type { CreditStatus } from "@shared/types";
interface LegacyBillingSnapshot {
  creditStatus: CreditStatus | null;
  creditLoading: boolean;
  creditError: string | null;
  refreshCreditStatus: () => void;
}
const snapshot: LegacyBillingSnapshot = {
  creditStatus: null, creditLoading: false, creditError: null, refreshCreditStatus: () => undefined
};
/** Retained presentation props for older components; no wallet state or requests. */
export function legacyBillingSnapshot(): LegacyBillingSnapshot { return snapshot; }
