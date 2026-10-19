import { lazy, Suspense, useEffect, useState } from "react";
import type { ReferralInviteDialogProps } from "./ReferralInviteDialogContent";

const ReferralInviteDialogContent = lazy(() => import("./ReferralInviteDialogContent")
  .then((module) => ({ default: module.ReferralInviteDialogContent })));

/** Load the optional invitation UI on first use, retaining its state after closing. */
export function ReferralInviteDialog(props: ReferralInviteDialogProps): React.ReactElement | null {
  const [opened, setOpened] = useState(props.open);
  useEffect(() => { if (props.open) setOpened(true); }, [props.open]);
  if (!props.open && !opened) return null;
  return <Suspense fallback={null}><ReferralInviteDialogContent {...props} /></Suspense>;
}
