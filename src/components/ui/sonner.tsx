import * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { cn } from "@/lib/utils";

export function Toaster(props: ToasterProps): React.ReactElement {
  const { className, style, toastOptions, ...sonnerProps } = props;
  const classNames = toastOptions?.classNames;

  return (
    <Sonner
      className={cn("iterlay-toaster", className)}
      duration={2400}
      gap={8}
      visibleToasts={3}
      offset={16}
      mobileOffset={12}
      containerAriaLabel="通知"
      style={{ "--width": "22rem", ...style } as React.CSSProperties}
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...classNames,
          toast: cn("iterlay-toast", classNames?.toast),
          content: cn("iterlay-toast__content", classNames?.content),
          title: cn("iterlay-toast__title", classNames?.title),
          description: cn("iterlay-toast__description", classNames?.description),
          icon: cn("iterlay-toast__icon", classNames?.icon),
          actionButton: cn("iterlay-toast__action", classNames?.actionButton),
          cancelButton: cn("iterlay-toast__cancel", classNames?.cancelButton),
          closeButton: cn("iterlay-toast__close", classNames?.closeButton)
        }
      }}
      {...sonnerProps}
    />
  );
}
