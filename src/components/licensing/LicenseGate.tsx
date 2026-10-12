import { freeAccessStatus } from '@shared/free-access';
import type { ReactNode } from 'react';
import { LicenseContext } from './license-context';
export { StartupLoading } from '@/components/system/StartupLoading';
const value = { status: freeAccessStatus(), busy: false, openCenter: () => {}, openActivation: () => {} };
/** Existing context contract without a gate, network checks, or activation dialogs. */
export function LicenseGate({ children }: { children?: ReactNode; delegateStartupLoading?: boolean }): React.ReactElement {
  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}
