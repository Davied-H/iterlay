import { useEffect, useRef, useState, type RefObject } from 'react';
export function PreviewViewport({ frame, runKey, visible, width, height }: {
  frame: RefObject<HTMLIFrameElement | null>; runKey: number; visible: boolean; width: number; height: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const resize = () => {
      // clientWidth is independent of the board zoom transform.
      if (element.clientWidth && element.clientHeight) setScale(Math.min(1, Math.max(1, element.clientWidth - 24) / width, Math.max(1, element.clientHeight - 24) / height));
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => observer.disconnect();
  }, [height, width, visible]);
  return <div ref={host} hidden={!visible} className="code-canvas__preview-stage">
    <div className="code-canvas__device-frame" style={{ width: width * scale, height: height * scale }}>
      <iframe key={runKey} ref={frame} title="Canvas 沙盒预览" sandbox="allow-scripts" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'" referrerPolicy="no-referrer" src={`${import.meta.env.BASE_URL}code-sandbox/index.html`} style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
    </div>
    <span className="code-canvas__preview-scale">{width} × {height} · {Math.round(scale * 100)}%</span>
  </div>;
}
