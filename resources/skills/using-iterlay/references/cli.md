# CLI workflows

Use installed `iterlay help` and `iterlay tools list --json` for the exact CLI contract. JSON stdout is `{ schemaVersion, ok, data }` or `{ schemaVersion, ok: false, error }`; progress goes to stderr. The bundled tool list does not prove backend availability. See [runtime.md](runtime.md) when selecting or recovering a connection.

All examples below omit context flags. Append the chosen `--standalone`, `--app-path` and/or `--user-data-path` consistently, or retain an explicitly selected `ITERLAY_USER_DATA_PATH`. Do not execute a reference example against a different workspace.

## Discovery and configuration

```sh
iterlay providers list --kind image --json
iterlay providers show <provider-id> --json
iterlay models list --provider <provider-id> --json
```

Discovery is local configuration, not a live model catalogue or a successful connection test. `providers set/default/remove` and `models set` support `--kind image`, `video` or `audio` when the connected backend implements them. An older App may support only video/audio changes; update the appropriate backend rather than switching workspace to bypass the error.

For a new image connection, use the requested base URL/model and an existing environment variable whose **name**, not value, is provided:

```sh
iterlay providers set --kind image --provider images --type openai-compatible \
  --base-url https://api.openai.com --model gpt-image-1 \
  --api-key-env OPENAI_API_KEY --default --json
iterlay models set --kind image --provider images --model <saved-model-id> --json
```

- Image protocols: `openai-compatible`, `openrouter`, `poe`, `ark`, `bailian`, `fal`. Use a protocol matching the actual service. `--api-mode images|responses`, `--generation-endpoint` and `--reference-endpoint` control image API routing. Endpoint paths are relative to the base URL; if it ends in `/v1`, set `/images/generations` and `/images/edits` instead of duplicating `/v1`.
- New video connections require `--type ark|fal|openrouter|minimax`, `--base-url` and `--model`.
- Audio uses `openai-compatible` TTS configuration; it saves settings only, not speech generation. `--speech-endpoint` defaults to `/v1/audio/speech`, relative to the base URL.

```sh
iterlay models set --kind video --provider <provider-id> --model <video-model-id> --json
iterlay providers set --kind audio --provider narration --name "Narration" \
  --base-url https://api.openai.com --model gpt-4o-mini-tts --voice nova \
  --api-key-env OPENAI_API_KEY --default --json
iterlay providers set --kind audio --provider narration --voice alloy --json
iterlay providers default narration --kind audio --json
iterlay providers remove narration --kind audio --json
```

Upserts preserve omitted fields and credentials. Repeated `--saved-model` replaces the saved list and includes the selected default model; `--default` sets the kind's default service. Built-in official providers cannot be changed. Configuration never submits generation or proves remote availability.

Accept new credentials through `--api-key-env <variable>` or piped `--api-key-stdin`; `--clear-api-key` explicitly removes one. These options are mutually exclusive. Do not pass a raw key in shell arguments, JSON calls or chat, print its environment value, or read/decrypt settings. Queries return credential presence only. Standalone credentials are separately configured; App OAuth does not migrate automatically.

For fal/OpenRouter video, `--connection-provider <matching-image-provider-id>` reuses that image connection. It cannot be combined with setting an independent key; use `--connection-provider none` to detach before configuring another connection.

## Generate, edit and export

```sh
iterlay image generate --prompt "A quiet forest" --n 1 --request-id <stable-request-id> --out ./forest.png --json
iterlay image edit --input ./forest.png --prompt "Change the season to autumn" --out ./autumn.png --json
iterlay tasks get <task-id> --json
iterlay tasks wait <task-id> --out ./result.png --json
iterlay video generate --prompt "Slow camera movement over the forest" --async --json
iterlay tasks wait <video-task-id> --kind video --out ./forest.mp4 --json
iterlay assets export --path <managed-path> --out ./image.png --json
```

Generation options include `--provider`, `--model`, `--size`, `--quality`, `--background`, `--style`, `--n`, repeated `--reference`, `--board`, `--async`, `--request-id` (images) and `--out`. An explicit board overrides the backend's CLI default; otherwise it reuses/creates `CLI 创作`. If the configured default was deleted, select a valid board before submission. In App mode this preference is editable in Settings → Coding Agent; standalone callers can pass `--board`.

To edit an existing board image without re-importing it, read `boards show` and pass the returned managed path:

```sh
iterlay call edit_image --input '{"boardId":"<board-id>","sourcePath":"<managed-path>","prompt":"Change the season to autumn","requestId":"<stable-request-id>"}' --json
```

The raw edit returns a task to wait for and preserves the target node's version chain. A convenience edit of a local file imports a new source; do not use it to stand in for a fixed existing version.

Use `--output-format png|jpeg|webp|svg|gif` only when the selected model/provider advertises it. `--out` names the destination; a filename extension does not select output encoding. GIF uses `--size 512x512` with `--frames` and `--frame-duration-ms`; inspect model support first. SVG cannot be supplied directly as a reference image. Do not change models or submit an extra generation just to obtain a different encoding without authorization.

File imports (`--reference`, edit `--input`, `assets import --input`) accept non-empty supported image/video files up to 20 MiB each, preserving original bytes. The CLI does not auto-compress. Decoded media has its own budget separate from prompt text. Oversize errors name the file and byte limit; use an appropriately sized source. Only App mode can offer an App import route. Provider limits may be lower; updating CLI cannot fix an older backend's import validation.

Images succeed as `succeeded`; videos as `completed`. `failed` and `cancelled` are unsuccessful; `unknown` or interrupted requests need remote/history verification before a new submission. `tasks get` is inspection; `tasks wait --out` also writes exports. Export failure does not invalidate a completed generation: re-export the original task. `stop_video_polling` affects local polling only and does not stop remote billing.

## Boards and assets

```sh
iterlay boards list --json
iterlay boards show <board-id> --json
iterlay boards create --name "Project assets" --json
iterlay call get_board_layout --input '{"boardId":"<board-id>"}' --json
iterlay call arrange_images --input '{"boardId":"<board-id>","nodeIds":["<a>","<b>"],"mode":"grid"}' --json
iterlay assets import --input ./reference.png --board <board-id> --json
```

Raw calls expose the bundled workbench catalogue, including layout, image versions, recoverable trash, media operations and video remix/extend. Validate IDs against the current workspace and use exact schemas. Convenience commands cover only some board operations; do not invent `boards delete` or other subcommands from a raw operation name. Use file imports instead of passing media base64 through the conversation.

In App mode, `boards open` / `open_iterlay` / view controls affect the App; `export_assets` uses the App download-directory/export flow (which may prompt for a directory). These operations report errors in standalone mode. Use `boards show`, layout inspection and `assets export --out` there. Do not claim the App displays standalone or remote results, or start a desktop solely to complete standalone validation.

## Local slicing

```sh
iterlay image slice --path <managed-path> --board <board-id> --rows 3 --columns 4 --out ./avatars --json
iterlay image slice --input ./sheet.png --rows 3 --columns 4 --margin 12 --gap 8 --json
iterlay image slice --node <node-id> --board <board-id> --crops '[{"x":10,"y":20,"width":300,"height":300}]' --json
```

Use this local operation instead of agent-side crop scripts. App mode uses the desktop slicer; standalone mode uses Sharp from the npm package. Neither calls a model. Inspect the source layout first. Supply exactly one source (`--path`, `--input` or `--node`); grid options and explicit crops are mutually exclusive. Each axis allows 1–8 cells and at most 64 crops. Coordinates, margin and gap are source pixels; odd dimensions may yield cells differing by one pixel.

Slicing preserves the original and adds managed PNGs to the board; it does not resize pixels, remove backgrounds or automatically identify subjects. Return `images`, `crops`, `nodeIds` and any `exportedPaths`. `--out` is a directory; existing files are protected. Retry exports without slicing again. Desktop ZIP delivery can use `export_assets`; standalone delivery uses explicit file exports.

## Reusable image templates

`templates list|show <id>` inspects custom templates in the selected workspace. They are shared with the App only in App mode. `templates create --name <name> --prompt <fixed-rules>` saves rules; `templates update <id> --prompt <rules>` updates them. Use `--expected-prompt <previous-rules>` to reject a stale change. `--input <JSON-file>` supports structured fields. Saving rules does not call a model.

Generate with `image generate --template <id> --prompt <run-content>` without modifying the fixed rules. Edit-mode templates use `image edit --template <id> --input <file> --prompt <instruction>`. Raw operations `generate_image` / `edit_image` accept `templateId`; results retain the source template ID. Built-in presets are not listed. Legacy App localStorage templates require the upgraded App to open once for migration; Node does not read or migrate those desktop templates.

## Saved annotation and mask requests

1. Read `list_modification_requests` and `get_modification_request` in the original workspace. Inspect its fixed source version; export annotation/mask paths for visual inspection. Never substitute the currently active image version.
2. If `needs-input`, clarify the actual desired edit with the user before `clarify_modification_request`. Saving or clarifying does not submit generation.
3. Atomically `claim_modification_request` with a unique Agent-session owner. Retain its `claim.token` without printing or sharing it; list/detail responses intentionally omit it.
4. Call `edit_image` with boardId, fixed sourcePath, reviewed prompt, modificationRequestId and claimToken. The backend binds mask/references and one durable execution key. Do not use `image edit --input` because that imports another source.
5. Wait for the returned task. Complete `finish_modification_request` with the request ID, claimToken, actual succeeded `job.id` and managed output paths. The backend verifies the matching edit and appends results once to the original node. Record errors through the same finish operation; never fabricate success or blindly retry an uncertain paid outcome.

For ordinary JSON, use shell-safe argument arrays when available. Claim credentials must not appear in user-facing output, temporary examples, exported files or logs.
