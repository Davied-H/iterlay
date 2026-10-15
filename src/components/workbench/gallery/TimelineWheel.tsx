import { useUiText } from "@/i18n";
import { useMemo } from "react";
import { OptionWheel } from "@/components/workbench/gallery/OptionWheel";

export interface TimelineBucket {
  key: string;
  label: string;
  count: number;
}

interface TimelineWheelProps {
  buckets: TimelineBucket[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

const CLICK_SOUND_URL = "data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYyLjMuMTAwAAAAAAAAAAAAAAD/+1DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAIAAAJxAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqr//////////////////////////////////////////////////////////////////wAAAABMYXZjNjIuMTEAAAAAAAAAAAAAAAAkBYYAAAAAAAACcU7MYgYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tQxAAACghZUlTHgAGDlWufHzAAAVWgJg3EszX3mlF95pSk7enve+GBDEMNMg4R8BLACwAsA7BVjjOhDEMQxWKx5EcJwfB/KBiU8/wI7QH+BHaA/ynv6PB8/LgQEMgD78CHO/oGiAIBAQBAYFAA1hDi4z22DmJ7Et+PSEd1f8Y4PmLI5uDYKAWyCmBlSZJ3gAmD0RBEUDS/HKFzC5iZIr/5FTIvE0Yl3/8ipkXi8Yl0u/xEFQVER7/WCoiCoKiL/4VBURPOqgAQuacbblgZh//7UsQEg8aUBv9cMIAgAAA0gAAABIKqErhFDZUNQ7PRK4S8s8r1HiuGlHuSnenrcW9yvO/PcFflep5XqPKfrO9NTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

export function TimelineWheel({ buckets, selectedKey, onSelect }: TimelineWheelProps): React.ReactElement {
  const uiText = useUiText();

  const items = useMemo(
    () => buckets.map((bucket) => bucket.label),
    [buckets]
  );
  const selectedIndex = Math.max(0, buckets.findIndex((bucket) => bucket.key === selectedKey));
  const selectedBucket = buckets[selectedIndex];
  const wheelKey = buckets.map((bucket) => bucket.key).join("|");

  return (
    <aside
      data-tour="gallery-timeline"
      className="gallery-timeline-wheel absolute bottom-[116px] left-0 top-14 z-20 w-[360px] max-[860px]:w-[300px] max-[620px]:bottom-auto max-[620px]:right-0 max-[620px]:h-14 max-[620px]:w-auto"
    >
      <div
        aria-hidden
        className="gallery-timeline-fade pointer-events-none absolute inset-y-0 left-0 -z-10 w-[640px] max-[860px]:w-[520px] max-[620px]:hidden"
      />
      <span className="sr-only">{uiText("生成时间")}</span>
      {buckets.length > 0 ? (
        <>
          <OptionWheel
            key={wheelKey}
            items={items}
            defaultSelected={selectedIndex}
            textColor="#b7c0cc"
            activeColor="#eef2f6"
            side="left"
            fontSize={3}
            spacing={1.4}
            curve={1}
            tilt={6}
            blur={2}
            fade={0.25}
            smoothing={200}
            inset={80}
            loop={false}
            draggable
            soundUrl={CLICK_SOUND_URL}
            soundVolume={0.5}
            ariaLabel="选择回顾日期"
            onChange={(index) => {
              const bucket = buckets[index];
              if (bucket && bucket.key !== selectedKey) onSelect(bucket.key);
            }}
            className="max-[620px]:hidden"
          />
          {selectedBucket ? (
            <div className="pointer-events-none absolute bottom-6 left-20 flex items-baseline gap-2 text-white/42 max-[860px]:left-12 max-[620px]:hidden">
              <span className="text-sm font-medium tabular-nums text-white/72">{selectedBucket.count}</span>
              <span className="text-xs">{uiText("次生成")}</span>
            </div>
          ) : null}
          <select
            aria-label={uiText("选择回顾日期")}
            value={selectedKey ?? ""}
            onChange={(event) => onSelect(event.target.value)}
            className="mx-4 mt-2 hidden h-8 min-w-0 rounded-md border border-white/10 bg-white/[0.06] px-2 text-xs text-white outline-none focus:border-white/30 max-[620px]:block"
          >
            {buckets.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {bucket.label} · {bucket.count}
              </option>
            ))}
          </select>
        </>
      ) : (
        <div className="flex h-full items-center px-20 text-sm text-white/38 max-[860px]:px-12">{uiText("暂无记录")}</div>
      )}
    </aside>
  );
}
