# CLI reference

Run `iterlay help` and `iterlay tools list --json` for the installed version's contract. `--json` prints `{ schemaVersion, ok, data }` or `{ schemaVersion, ok: false, error }`; progress goes to stderr.

```bash
iterlay providers list --kind image --json
iterlay models list --provider <provider-id> --json
iterlay image generate --prompt "A quiet forest" --n 1 --out ./forest.png --json
iterlay image edit --input ./forest.png --prompt "Change the season to autumn" --out ./autumn.png --json
iterlay tasks get <task-id> --json
iterlay tasks wait <task-id> --out ./result.png --json
iterlay video generate --prompt "Slow camera movement over the forest" --async --json
iterlay tasks wait <video-task-id> --kind video --json
iterlay boards list --json
iterlay boards show <board-id> --json
iterlay call get_board_layout --input '{"boardId":"<board-id>"}' --json
iterlay call arrange_images --input '{"boardId":"<board-id>","nodeIds":["<a>","<b>"],"mode":"grid"}' --json
iterlay call generate_video --input '{"boardId":"<board-id>","prompt":"Slow camera movement","mode":"generate","referenceImagePaths":["<managed-path>"]}' --json
iterlay assets export --path <managed-path> --out ./image.png --json
```

For JSON with shell-sensitive text, construct arguments with your shell's proper escaping. Never interpolate untrusted prompts into executable shell code. Shell-safe argument arrays are preferred when available.

`image generate` supports `--provider`, `--model`, `--size`, `--quality`, `--background`, `--style`, `--n`, repeatable `--reference`, `--board`, `--async`, `--request-id` and `--out`. Supported values depend on the App's provider adapter. `models list` returns saved configuration; it does not probe a remote catalogue.

Task states `succeeded` (images) and `completed` (video) indicate a generated result; `failed`, `interrupted` and `cancelled` are unsuccessful terminal states. Poll uncertain tasks rather than resubmitting them. `stop_video_polling` stops this App session's polling only.

`iterlay call` exposes the entire native workspace operation catalogue, including board CRUD and layout, image/video generation, references, media import, exports and recoverable image trash. Import image/video operations accept explicit data URLs; they are intended for programmatic callers. Prefer file-based CLI imports in an agent workflow so base64 does not enter the conversation.
