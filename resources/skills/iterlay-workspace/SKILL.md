---
name: iterlay-workspace
description: Drive an Iterlay visual workspace through its configured MCP server. Use when Codex needs to inspect or create boards, generate or edit images, generate, remix, extend, or import videos, validate visual outputs, check task status, or export selected Iterlay assets.
---

# Iterlay Workspace

Use the `iterlay` MCP server as the source of truth for boards, assets, image and video tasks, and managed files. Keep visual work traceable in a named board and treat generation success and delivery acceptance as separate states.

## Preconditions

- Confirm that the `iterlay` MCP server is available before calling tools. If it is absent, tell the user to open Iterlay and use Settings > Coding Agent to configure the current client.
- Keep Iterlay open while using board, asset, generation, edit, import, or export tools. The stdio server connects to the running desktop App.
- Read [references/mcp-tools.md](references/mcp-tools.md) when exact tool inputs, outputs, or limitations matter.
- Read [references/visual-qa.md](references/visual-qa.md) for multi-image work, UI screens, exact-size requests, image edits, or any task where clipping would affect delivery.

## Workflow

1. Resolve the workspace. If the user explicitly names a board ID or a unique board name, use it. Otherwise call `get_active_board`; when it returns a board, use that active board and do not create another one.
2. When there is no active board and the user did not name one, call `list_boards` and ask explicitly whether to use an existing board or create a new board. Do not create or select a board, or submit a generation, until the user answers.
3. Inspect the resolved board with `get_board` when the request depends on existing images, versions, prompts, dimensions, or composition.
4. Compose the board with dedicated mutations. Use `move_image` for absolute canvas coordinates, `resize_image` for a 120-600 display width with preserved aspect ratio, and `arrange_images` for horizontal, vertical, or grid layout. Use `duplicate_images` to preserve an image's version lineage, `set_image_version` with a zero-based index to choose its active version, and `trash_images` for recoverable removal. Keep returned `trashId` values when restoration may be needed; `restore_image` returns the image to its source board and original layout. Read the board before mutations when node IDs or current state are unknown, then validate with `get_board_layout`.
5. Before batch generation or exact-size work, define one output contract: result count, canonical pixel dimensions or aspect ratio, and critical-content safe area. Do not put dimensions or aspect ratios in the prompt that conflict with the `size` argument. Treat `size` as a request until actual output dimensions are verified.
6. When the user supplies a reference image, import it before generating. Pass its data URL and the resolved `boardId` to `import_image`, then pass the returned managed path in `generate_image.referencePaths`. Reuse an existing managed path when the reference is already on the board.
7. Generate only on an explicit user request. Use `generate_image` with the resolved `boardId`, a concrete production prompt, and `n: 1` unless the user asks for variants. It returns a `generationId` immediately; it does not mean the image has been created or accepted.
8. Edit only a managed Iterlay image. Obtain `sourcePath` and source dimensions from `get_board` or `list_assets`, then call `edit_image` with a concrete edit instruction. Because `edit_image` has no size control, never assume the edited output preserves dimensions; verify it.
9. Poll every generation or edit with `get_generation_status` until it is `succeeded` or `failed`, waiting about 3 seconds between checks. Do not leave paid tasks running when ending the turn.
10. On success, call `get_board` and verify that every output is on the target board. Inventory each node and active version's reported `width` and `height`. For batch or exact-size work, run `node scripts/validate-image-batch.mjs [--expected WIDTHxHEIGHT] [--ratio W:H] <paths...>` to read the physical file headers. Require the physical dimensions to equal the corresponding node or active-version metadata; a mismatch is a hard validation failure because the board frame may crop the image. A provider success with a failed dimension check is not a completed delivery.
11. Perform the visual checks in [references/visual-qa.md](references/visual-qa.md). Inspect original-resolution outputs when an image inspection tool is available, then inspect the Iterlay board view. Check edge content, text, safe areas, active-version framing, and apparent cropping. If full-resolution or board-level visual inspection is unavailable, state that limitation instead of claiming the images are uncropped.
12. Call `get_board_layout`. Require no `overlappingNodePairs`, but do not treat this as proof that image content is uncropped. Use `open_board` when the saved viewport should remain unchanged, `focus_nodes` to review selected nodes, or `fit_board_view` after dimension and visual checks pass so all board content is visible.
13. Import only valid image data URLs. Include `boardId` when the result should immediately appear on a canvas.
14. Export only user-selected asset paths. State the returned ZIP path; do not open or distribute it unless asked.

## Video Workflow

1. Import only `video/mp4`, `video/quicktime`, or `video/webm` data URLs with `import_video`. Include `boardId` when the imported video should appear on the canvas. Do not pass a remote URL or report one as a completed result; successful media must have a managed local `path`.
2. Use `generate_video` only on an explicit user request. Resolve the target board first and pass managed paths for first and last frames, image references, source video, video references, and audio references. Use `mode: generate` for a new result, `remix` to add a version to a target video, and `extend` to create a derived continuation according to the board workflow.
3. Treat the returned `videoGenerationId` as task acceptance, not completion. Poll `get_video_generation_status` until `completed`, `failed`, or `cancelled`. A completed response must expose the managed local video path; never use a Provider URL as the deliverable.
4. A completed ordinary generation is appended to its board idempotently. Remix or extend requests that target an existing video node follow the App's version or derivation behavior and must not be appended as a duplicate ordinary result by the MCP bridge.
5. Use `stop_video_polling` only to stop this local App session from actively polling. It does not cancel the Provider task, does not prevent remote billing, and does not make the task terminal. The task may be queried or recovered later.

## Decision Rules

- Treat `generate_image`, `edit_image`, `generate_video`, `import_video`, `trash_images`, and `export_assets` as external-effect operations. The user's direct request authorizes them; otherwise, present the intended action and ask for confirmation.
- Preserve image lineage. Prefer editing an existing managed source image when its dimensions satisfy the output contract. Normalize or regenerate inconsistent sources before using them for a uniform batch.
- For a uniform batch, require identical pixel dimensions by default. Do not accept merely similar aspect ratios unless the user explicitly allows variable sizes.
- Keep critical text and controls inside the declared safe area. Prompt-level safe-area instructions are not validation; inspect the result.
- Do not expose provider keys, local bridge tokens, or raw workspace files in responses.
- Keep prompts specific about subject, composition, style, text, and constraints. Avoid brand claims or copyrighted style references that the user did not request.
- When a paid operation fails validation, report the exact failure and retain the board context. Do not retry automatically.

## Completion Criteria

Report completion only when required tasks are terminal, expected outputs exist on the target board, all media results use managed local paths, the output contract passes, visual QA passes, nodes do not overlap, and the fitted board view has been requested. Otherwise distinguish `generation succeeded` from `validation failed` and identify the smallest corrective action.

## Output

After a successful visual operation, state the board name or ID, task status, validated result count, canonical dimensions, and any returned managed image, video, or ZIP paths. Keep the response compact; Iterlay is the visual review surface.
