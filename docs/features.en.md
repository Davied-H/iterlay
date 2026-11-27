# Detailed features

[Back to README](../README.md)

The following capabilities are implemented in this repository. Experimental areas are labeled; individual model capabilities and availability in older installers can differ.

### 🧭 Canvas & workspace

- [x] Infinite canvas with pan, zoom, fit-to-view, and a minimap.
- [x] Image, text, and video nodes; group related material and connect nodes visually.
- [x] Move, resize, duplicate, and arrange images in rows, columns, or grids.
- [x] Multiple boards with search, sorting, and card/list views.
- [x] Undo/redo, local autosave, and an image trash with restore.

### 🎨 Image generation & editing

- [x] Text-to-image generation and reference-image workflows.
- [x] Continue editing an existing image through natural-language instructions.
- [x] Image editing assistant to clarify the change before generation.
- [x] Annotation/mask edit briefs for describing local changes and handing them to an agent.
- [x] Per-node image versions, version switching, and slider comparison.
- [x] Provider/model selection, generation settings, and task history.

- [x] Preserve model originals; deliver PNG/JPEG/WebP locally with scaling, cropping, or padding, and retry delivery separately.
- [x] Native/author SVG modes and GIF output, gated by real generation verification.

### 🎬 Video creation

- [x] Text-to-video and image-to-video with supported providers.
- [x] Model-dependent first/last frames, video remix, and extension.
- [x] Import video, view it on the board, and track generation tasks.
- [x] Video sequence editor with clip ordering and MP4 / H.264 export.

### 🧩 Templates & reusable workflows

- [x] Create, organize, import, and export reusable visual templates.
- [x] Extract a reusable template from an image with a configured text model.
- [x] Template assistant and reference-aware prompt composition.
- [x] Keep reusable directions alongside project-specific experiments.

### 📦 Assets & delivery

- [x] Import images and organize assets across boards and the asset library.
- [x] Slice images into separate reusable assets.
- [x] Download individual results or export selected assets as a ZIP.
- [x] Export/import board packages (`.itb`) to carry a workspace into another installation.
- [x] Export WeChat sticker assets, including static and animated GIF workflows.

<details>
<summary><strong>🤖 Coding agents, model connections & experimental extensions</strong></summary>

#### Coding agent tools

- [x] Bundled CLI and installable Skills for Codex and Claude Code.
- [x] Reuse the App's saved model providers and authorization.
- [x] Generate/edit images, generate/import video, and inspect task status.
- [x] Inspect boards, arrange assets, switch versions, and export deliverables.
- [x] Read and claim annotation edit briefs, then attach completed results.
- [x] JSON output and discoverable operation schemas through `iterlay tools list --json`.

- [x] Standalone Node backend and server operation without the App or Electron, using a separate workspace.

#### Model connections & local workspace

- [x] Multiple image/video providers and OpenAI-compatible text models.
- [x] API-key connections and Codex account authorization.
- [x] Local board and asset storage, English/Chinese interface, and theme settings.
- [x] macOS and Windows packaging configurations; actual installers are listed in Releases.

#### Experimental extensions

- [x] Tool plugin installation, enable/disable, removal, and local `.iterlay-plugin` import.
- [x] Official short-drama assistant: story, characters, storyboards, and production views.
- [x] Image reconstruction workflow with layer asset and PSD export.

The plugin catalog currently ships with the App. A public third-party online marketplace, provider-plugin runtime, and automatic plugin updates are not implemented. Reconstruction quality depends on the source and configured services; it is not a promise to recover an original design file. See the [plugin guide](../docs/plugins.md).

</details>
