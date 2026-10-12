import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function Field({ label, children }: { label: string; children: ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
