import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { ImageSliceDialog } from "@/components/canvas/ImageSliceDialog";
import type { GeneratedImage } from "@/components/canvas/ImageNode";
import "../../styles.css";

const image: GeneratedImage = {
  id: "slice-preview",
  path: "preview",
  dataUrl: "/output/playwright/emoji-grid.png",
  jobId: "slice-preview",
  source: "upload",
  width: 1254,
  height: 1254
};

function Preview(): React.ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <button type="button" onClick={() => setOpen(true)}>打开切图</button>
      <ImageSliceDialog
        open={open}
        image={image}
        onOpenChange={setOpen}
        onConfirm={async () => undefined}
        aiAvailable
        aiProviderName="验收 Provider"
      />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>
);
