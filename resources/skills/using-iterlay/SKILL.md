---
name: using-iterlay
description: Use Iterlay CLI to generate or edit images and videos, configure models, and manage boards, templates and assets in App-connected or standalone mode. Use only when explicitly invoked as /using-iterlay or $using-iterlay, or when the user asks to use this skill.
disable-model-invocation: true
---

# Using Iterlay

Use the `iterlay` CLI through the shell. Keep this skill explicitly invoked; if no task was supplied, ask what to create or manage. A generation request authorizes that generation; use one output unless the user requests variants. Do not submit a paid request just to test readiness.

## Choose the workspace before acting

**An independently installed CLI can still connect to the Electron App. Installation method does not determine runtime mode.**

| User intent | Command context | Where results live |
| --- | --- | --- |
| Work with the local App's canvas or saved models | Default CLI; `--app-path <App root>` for an explicit installation | App workspace, visible in the App |
| Work without an App or on a headless server | `--standalone`, plus `--user-data-path <directory>` when supplied | Separate Node workspace |
| Continue an existing task or board | Same host, executable, mode and workspace options used when it was created | Original workspace |

Without explicit mode, a discoverable App is preferred; otherwise the CLI selects Node. Preserve the user's selection across **every** command, including discovery, polling, raw calls and exports. Do not add `--standalone` merely because CLI was installed via npm. Installing an App later can change the default; pin the mode/path when continuing standalone work.

App and standalone workspaces do not automatically synchronize boards, tasks, templates or credentials. The desktop App does not attach to a remote Node workspace. Never point standalone mode at the App data directory to simulate sharing. For remote work, execute CLI on the requested host; distinguish remote exports from files delivered to the user's machine.

For non-default paths, first-time setup, server lifecycle or connection errors, read [runtime.md](references/runtime.md).

## Check readiness in that context

1. Read `iterlay help` when the installed CLI's capabilities are unclear. Run `iterlay status --json` and `iterlay providers list --json` with the selected context. Check exit code and `ok`. Standalone status reports `data.runtime: "node"` and its workspace path; older App status may omit these fields. Omission is not a capability or health guarantee.
2. Inspect `models list --provider <id>` for the chosen service. Saved configuration and credential presence do not prove remote availability. Reuse existing model connections; when configuration is needed, follow [runtime.md](references/runtime.md) and [cli.md](references/cli.md). Never read settings files or decrypt credentials.
3. Use `iterlay tools list --json` for operation schemas. This list is bundled with the CLI and readable offline; it does not prove the connected backend supports every operation. An unsupported-operation error requires checking backend compatibility, not switching workspaces or resubmitting generation.

Examples below omit context flags for readability; retain the selected flags or explicit environment in actual commands. Construct argument arrays or use proper shell quoting for prompts and JSON; never interpolate untrusted text into shell code.

## Generate, edit and recover

- Generate: `iterlay image generate --prompt "…" --out ./result.png --json`. Use a provider ID from discovery, or the selected workspace's default. For requested formats, inspect discovered capabilities; `--output-format` is not universally supported.
- Edit a local image: `iterlay image edit --input ./source.png --prompt "…" --out ./edited.png --json`. Repeated `--reference <file>` imports reference files. Preserve originals. For an existing board node, use its managed path through `call edit_image` to retain its version chain; see [cli.md](references/cli.md).
- Use `--board <id>` for a user-specified board and inspect it first. Otherwise the backend uses its configured CLI default or reuses/creates `CLI 创作`. If a configured board is deleted, provide a valid board rather than falling back silently.
- Commands normally wait. `--async` returns acceptance only; finish with `tasks wait <id>` (add `--kind video` for videos). Ctrl+C and timeout stop waiting, not the remote job or its billing.
- Use a stable `--request-id` for an image submission and query that ID after a lost response. Reusing it with changed parameters conflicts. `unknown` means outcome and fees are uncertain; inspect history/provider state before any new submission.
- A successful task whose export failed is recoverable with `tasks wait <id> --out …`. Do not generate again. Output files are protected unless the user authorizes replacement with `--overwrite`.
- `tasks cancel <id>` cancels images only before provider submission. Stopping video polling does not cancel a remote video task. Do not stop the shared backend merely because this CLI command has finished.

## Manage the workspace

Use `boards list|show|create`, `assets list|import|export`, `templates list|show|create|update`, or `call <operation> --input '<JSON>'`. See [cli.md](references/cli.md) for configuration, format, template, slice and saved annotation/mask workflows. Read only the sections needed for the task.

- Use Iterlay's local `image slice` operation for contact sheets and sprite grids, after checking the source layout. It preserves the source, saves managed PNGs and adds them to the target board without calling a model. Export failure does not require slicing again.
- Use returned managed paths for backend operations. Local file imports use `--input`/`--reference`; do not substitute arbitrary filesystem paths for managed assets.
- In App mode, opening/focusing boards and desktop ZIP export are available. In standalone mode, use `boards show`, `get_board_layout` and explicit file exports; window operations and desktop ZIP export are unavailable. Do not promise a visible canvas or invoke App windows to validate standalone results.
- Audio currently supports TTS configuration only, not speech, music or sound-effect generation.

## Validate and deliver

Export requested results and inspect the physical files. For exact sizes, batches, edits or clipping-sensitive work, read [visual-qa.md](references/visual-qa.md). Board display width is not physical image width, and layout checks do not prove image contents are uncropped.

Report the task ID, board ID, runtime/workspace context, exported paths, warnings and any unverified checks. For video, deliver a managed/exported file, not a temporary provider URL. Do not claim standalone results appeared in the App. If a paid output fails acceptance, retain its context; do not submit another paid generation unless already authorized.

`iterlay guard descriptor` only reads optional bundled command-review metadata; it does not install Guard or grant permissions. Generic calls, configuration and exports may mutate state even when adjacent discovery commands are read-only.

## Verify extended output formats

`outputFormats` is a local declaration. Only `verifiedOutputFormats` / matching `outputVerification.status=passed` establish a successful real format check for this connection. SVG/GIF must pass verification before normal generation. Configure via `configure_provider` with `outputFormats` and `svgModel`; then call `verify_image_output` with `providerId`, `outputFormat` and `acknowledgeCharges=true` only when the user explicitly authorizes that potentially paid test. Read-only connection checks do not validate generation. Originals are retained in history even when format validation fails. Configuration or credential changes invalidate old evidence. Do not retry uncertain paid verification blindly or claim that a requested format was delivered without checking the result.

SVG has explicit `svgMode=native|author` per model. Native sends SVG extension fields to the Images endpoint. Author uses the configured `svgModel` through the same provider connection to produce and sanitize actual vector source; `execution.mode=svg-author` identifies this route. It is not native image-model SVG. Switching routes invalidates verification. Never silently fall back between routes or embed a raster in SVG.
