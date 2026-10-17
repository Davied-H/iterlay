---
name: iterlay-workspace
description: Use the Iterlay CLI to generate or edit images, generate or import videos, inspect and arrange boards, manage assets, and export results using the model providers already saved in the Iterlay App.
---

# Iterlay Workspace

Use the `iterlay` CLI through your shell tool. App configuration and credentials are reused automatically; never read settings files, decrypt credentials, or configure a second model connection.

## Start

1. Run `iterlay status --json` and `iterlay providers list --json`. If the command is missing, open Iterlay → Settings → Coding Agent and repair the CLI installation. For an existing terminal whose PATH is stale, use the absolute launcher path shown there or open a new terminal.
2. Check the returned `ok` field and process exit code. Provider metadata reports saved configuration, not a guarantee that its remote service is available. If no usable image provider exists, guide the user to App model settings.
3. Run `iterlay tools list --json` for the exact operation schemas. All workspace operations are accessible through `iterlay call <operation> --input '<JSON>' --json`. Read [references/cli.md](references/cli.md) for examples.

## Create and edit

- A user request to generate authorizes that generation. Use one output unless variants were requested. Do not generate images merely to test a connection.
- Use `iterlay image generate --prompt "…" --out ./result.png --json`. Omit `--provider` to use the App default; use IDs from provider discovery for an explicit selection. `iterlay models list --provider <id> --json` lists the saved models.
- Pass local references as repeated `--reference <file>` options. The CLI imports them as managed assets. Edit with `iterlay image edit --input <file> --prompt "…" --out <new-file> --json`; preserve the original.
- Use explicit `--board <id>` for an existing board named by the user. Inspect its contents first. Without --board, image and video commands use the default board configured in Settings → Coding Agent. When unset, they reuse or create CLI 创作. A deleted default board must be reselected before generating.
- Normal image and video commands wait for completion. `--async` returns task acceptance only; follow with `iterlay tasks wait <id> --json` (add `--kind video` for videos). Ctrl+C or timeout ends waiting, not the provider task.
- Never blindly resubmit an operation after a lost response. Use a stable `--request-id` for image generation and query it as a task ID. Report interrupted or uncertain remote state instead of creating another paid task.
- When generation succeeds but export fails, reuse `tasks wait <id> --out …`; do not regenerate. Existing export files are protected unless the user explicitly requests replacement with `--overwrite`.

## Boards, video and assets

- `iterlay boards list|show|create|open`, `iterlay assets list|import|export`, and `iterlay video generate` cover common paths. See CLI help for arguments.
- Use the exact `tools list` schemas through `iterlay call` for move, resize, arrange, duplicate, version selection, recoverable trash/restore, video remix/extend and stopping video polling. These operations retain the App's validation rules.
- Import files with `iterlay assets import --input <file> --board <id> --json`. Advanced operations require returned managed paths; never substitute arbitrary filesystem paths.
- Video completion requires a managed local output path. Provider URLs are temporary and are not deliverables. Stopping local polling does not cancel a remote job or its billing.
- Export only requested results. Return task ID, board ID, managed and exported paths, warnings and validation limits; never expose tokens or provider credentials.

## Validate delivery

Generation success is distinct from delivery acceptance. For exact sizes, batches and editing work, read [references/visual-qa.md](references/visual-qa.md). Check actual file dimensions, original-resolution content and corresponding board metadata; a requested size is not proof of output size. `resize_image` affects canvas display width, not physical pixels. Layout checks find node overlaps, not clipped content. Use the bundled validation script when needed.

When a paid output fails validation, retain the task and board context, report the concrete failure and ask before an additional generation unless the user already authorized it. Do not require another permission for read-only inspection or the work already requested.
