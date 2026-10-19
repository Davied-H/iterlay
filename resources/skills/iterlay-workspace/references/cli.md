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

Video and TTS configuration (requires an App version exposing `configure_provider`):

```bash
iterlay providers show <provider-id> --json
iterlay models set --kind video --provider <provider-id> --model <video-model-id> --json
iterlay providers set --kind audio --provider narration --name "Narration" --base-url https://api.openai.com --model gpt-4o-mini-tts --voice nova --api-key-env OPENAI_API_KEY --default --json
iterlay providers set --kind audio --provider narration --voice alloy --json
iterlay providers default narration --kind audio --json
iterlay providers remove narration --kind audio --json
```

`providers set` upserts by ID, generating one when omitted. New video providers require `--type ark|fal|openrouter|minimax`, `--base-url` and `--model`. Audio uses `openai-compatible`, with `--speech-endpoint /v1/audio/speech` by default; the endpoint is relative to the configured base URL. Audio configuration is persisted only; there is no speech-generation command yet. Repeated `--saved-model` replaces the saved list and includes the selected default model. Omitted fields, including credentials, are preserved. Use `--default` to select the service as its kind's default. Built-in official providers cannot be changed.

Credentials are accepted through `--api-key-env <variable>` or piped `--api-key-stdin`; never pass raw keys in arguments or `call --input`. `--clear-api-key` explicitly clears a key. These flags are mutually exclusive. Queries return only credential presence. `--connection-provider <image-provider-id>` reuses a matching fal/OpenRouter image connection for video, and cannot be combined with setting a standalone key. Use `--connection-provider none` to detach first. Configuration does not submit generation or verify remote availability.

`image generate` supports `--provider`, `--model`, `--size`, `--quality`, `--background`, `--style`, `--n`, repeatable `--reference`, `--board`, `--async`, `--request-id` and `--out`. Supported values depend on the App's provider adapter. `models list` returns saved configuration; it does not probe a remote catalogue.

Task states `succeeded` (images) and `completed` (video) indicate a generated result; `failed`, `interrupted` and `cancelled` are unsuccessful terminal states. Poll uncertain tasks rather than resubmitting them. `stop_video_polling` stops this App session's polling only.

`iterlay call` exposes the entire native workspace operation catalogue, including board CRUD and layout, image/video generation, references, media import, exports and recoverable image trash. Import image/video operations accept explicit data URLs; they are intended for programmatic callers. Prefer file-based CLI imports in an agent workflow so base64 does not enter the conversation.

Without `--board`, generation uses the default board in Settings → Coding Agent; when unset it reuses or creates `CLI 创作`. An explicit `--board` overrides this preference. A deleted default board causes an error before submission; choose a new default or provide `--board`.
