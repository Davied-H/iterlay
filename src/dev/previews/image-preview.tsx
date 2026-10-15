import { useState } from "react";
import { createRoot } from "react-dom/client";
import previewImage from "@/assets/creative-direction-architecture.png";
import { ImageZoomLightbox } from "@/components/workbench/asset/ImageZoomLightbox";
import "@/styles.css";

function Preview(): React.ReactElement {
  const [open, setOpen] = useState(true);

  return (
    <main className="grid min-h-screen place-items-center bg-muted p-8 text-foreground">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 rounded-md bg-foreground px-4 text-sm text-background"
      >
        打开图片预览
      </button>
      {open ? (
        <ImageZoomLightbox
          src={previewImage}
          alt="建筑视觉方案"
          imageWidth={1024}
          imageHeight={1024}
          currentIndex={1}
          totalCount={2}
          title="建筑视觉方案 01"
          metadata={{
            name: "建筑视觉方案 01",
            model: "Iterlay Image",
            fileType: "PNG",
            fileSize: "2.4 MB",
            resolution: "1024 × 1024",
            createdAt: "2026/03/24 14:32",
            createdBy: "Iterlay"
          }}
          onDownload={() => undefined}
          onNext={() => undefined}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
