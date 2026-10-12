import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { SegmentedControlIndicator } from "@/components/ui/segmented-control-indicator";
import { cn } from "@/lib/utils";

interface TabsSliderContextValue {
  activeValue: string | undefined;
  layoutId: string;
}

const TabsSliderContext = React.createContext<TabsSliderContextValue | null>(null);

export const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, children, ...props }, ref) => {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const instanceId = React.useId();
  const activeValue = value ?? uncontrolledValue;

  const handleValueChange = React.useCallback((nextValue: string) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  }, [onValueChange, value]);

  return (
    <TabsSliderContext.Provider value={{ activeValue, layoutId: `tabs-slider-${instanceId}` }}>
      <TabsPrimitive.Root
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsSliderContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const slider = React.useContext(TabsSliderContext);
  const active = slider?.activeValue === value;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "relative isolate inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        className
      )}
      {...props}
    >
      {active && slider ? (
        <SegmentedControlIndicator
          layoutId={slider.layoutId}
          className="rounded-sm bg-background shadow-sm"
        />
      ) : null}
      <span className="relative z-10 inline-flex items-center justify-center gap-1.5">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
