# Iterlay MCP Tools

Use only these tool names and inputs.

| Tool | Required input | Result |
| --- | --- | --- |
| `list_boards` | none | Board summaries |
| `get_active_board` | none | The board currently active in the Iterlay workspace, or `null` |
| `get_board` | `boardId` | Nodes, versions, and managed image URLs |
| `get_board_layout` | `boardId` | Rendered content bounds and overlapping node pairs |
| `open_board` | `boardId` | Opens the board without changing its saved viewport |
| `fit_board_view` | `boardId` | Opens the board and fits all image nodes into the visible canvas |
| `focus_nodes` | `boardId`, `nodeIds` | Opens the board, selects the requested nodes, and fits them into view |
| `move_image` | `boardId`, `nodeId`, `x`, `y` | Moves an image node to absolute canvas coordinates and returns its previous and new position |
| `resize_image` | `boardId`, `nodeId`, `displayWidth` (120-600) | Resizes an image node and returns its rendered width and derived height |
| `arrange_images` | `boardId`, at least two `nodeIds`, `mode` | Arranges images horizontally, vertically, or as a grid; optional `gap` defaults to 40 |
| `duplicate_images` | `boardId`, `nodeIds` | Duplicates images and their versions; optional X/Y `offset` defaults to 24 |
| `trash_images` | `boardId`, `nodeIds` | Moves images to recoverable trash and returns `trashId` values |
| `restore_image` | `trashId` | Restores one image to its source board and original layout |
| `set_image_version` | `boardId`, `nodeId`, `versionIndex` | Activates a zero-based image version index |
| `create_board` | optional `name` | New board |
| `list_assets` | optional `limit` (1-100) | Paged asset items |
| `generate_image` | `boardId`, `prompt`; optional `referencePaths` | Starts a task and immediately returns a `generationId`; managed references are passed to the provider and remain on the board |
| `edit_image` | `boardId`, `sourcePath`, `prompt` | Starts an edit task and immediately returns a `generationId` |
| `get_generation_status` | `generationId` | Current or terminal task record; completed responses include image results |
| `import_image` | `dataUrl`; optional `boardId` | Managed image path; append it to the target board before using it as a generation reference |
| `generate_video` | `boardId`, `prompt`; optional mode and managed references | Starts an asynchronous video task and immediately returns a `videoGenerationId` |
| `get_video_generation_status` | `videoGenerationId` | Persisted task state; completed responses expose a managed local video path and ordinary results are appended idempotently |
| `stop_video_polling` | `videoGenerationId` | Stops polling in the current App session only; it does not cancel the remote task |
| `import_video` | video `dataUrl`; optional `boardId` | Managed video path; optionally appends a video node to the target board |
| `export_assets` | `paths` | ZIP written to Iterlay's download directory |
| `open_iterlay` | none | Brings the desktop workspace forward |

Optional generation inputs are `n` (1-4), `model`, `size`, `quality`, `style`, `background`, `useCase`, and `providerId`. Set `background` to `transparent` to request a PNG with an alpha channel from a compatible GPT Image provider.

Image arrangement uses canvas coordinates, not image pixels. `resize_image` changes only `displayWidth`; Iterlay derives the rendered height from the active image version and always preserves its aspect ratio. `arrange_images.mode` is `horizontal`, `vertical`, or `grid`, with an optional `gap` from 0 to 1000. `trash_images` is recoverable and returns the `trashId` required by `restore_image`. Version indices are zero-based.

Optional `generate_video` inputs are `mode` (`generate`, `remix`, or `extend`), `model`, `aspectRatio`, `resolution`, `durationSeconds`, `referenceImagePaths`, `firstFramePath`, `lastFramePath`, `sourceVideoPath`, `referenceVideoPaths`, `referenceAudioPaths`, `generationNodeId`, `targetVideoNodeId`, `generateAudio`, `watermark`, and `providerId`. All media paths must be managed Iterlay paths. Pass the board's video generation node ID when a remix or extend request targets an existing video node.

Video task terminal states are `completed`, `failed`, and `cancelled`. Polling can also report submitting, queued, generating, post-processing, or recovering states. `stop_video_polling` only stops local polling and returns `remoteCancelled: false`; the Provider task may continue and may still incur charges. Completed MCP results must use managed local paths. Provider result URLs are temporary transport details and must never be returned or treated as final assets.

## Validation-Relevant Limitations

- `generate_image.size` is a provider request, not proof of the returned pixel dimensions. Read the completed image results and `get_board` nodes, then validate the physical file headers.
- Treat `get_board` node and version dimensions as frame metadata, not independent proof of the underlying file dimensions. Compare them with the managed image file; mismatches can produce visible cropping.
- Do not specify a tool `size` and a conflicting prompt dimension or aspect ratio. When exact provider-supported sizes are unknown, prefer one aspect-ratio instruction and validate the output.
- `edit_image` has no `size` or `preserveDimensions` input. Compare the edited result dimensions with the source and with the batch contract.
- `get_board_layout` reports rendered node bounds and node-to-node overlap only. It does not detect clipped pixels, unsafe internal margins, text overflow, active-version crop, or content hidden by an image fit mode.
- `fit_board_view` changes the visible viewport. It does not validate dimensions, visual integrity, or cropping.
- `resize_image` changes the canvas frame size, not the physical image dimensions.
- `focus_nodes` changes the visible viewport and selection only; it does not mutate board content.
- A terminal `succeeded` generation status means the provider returned an image. It does not mean the image passed delivery validation.

`edit_image.sourcePath` must be a managed Iterlay asset path. Use `get_board` or `list_assets`; never supply an arbitrary filesystem path.

Do not put base64 media data, provider secrets, or tokens into prompts. `import_image` and `import_video` accept `data:` URLs only as their explicit tool arguments. `import_video` accepts only base64 MP4, MOV (`video/quicktime`), and WebM data URLs; it rejects ordinary remote URLs.
