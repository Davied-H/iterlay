# Runtime, installation and connection recovery

Read this when choosing a non-default workspace, setting up a fresh machine, connecting to the App, using a server, or diagnosing connection errors. Keep the selected host, executable and options with the task ID for later continuation.

## Installation and runtime are separate

- An npm-installed CLI can connect to the local Electron App, reuse its models and credentials, and create results on its canvas.
- The CLI without an App can run its own Node backend. Standalone npm packages require Node.js >=22.12.0; App-bundled launchers use the App's runtime.
- Discoverable App installations are preferred by default. `--standalone` forces Node; `serve` runs Node in the foreground. `--standalone` and `--app-path` cannot be combined.
- App mode can start a hidden App backend. The user need not open a window first. Node mode normally starts a detached backend and keeps asynchronous jobs running after CLI exit.

Use the installed executable's help, not the package version alone, to check for standalone support. Independently distributed CLI and App releases can have different capabilities; an offline tool schema comes from the client bundle, not backend negotiation.

## Keep the command context explicit

Default App workspace:

```sh
iterlay status --json
iterlay providers list --kind image --json
iterlay boards list --json
```

For a nonstandard macOS installation, supply the App root directory (not its executable):

```sh
iterlay status --app-path /Applications/Iterlay.app --json
```

On Windows/Linux, use the installation directory containing `Iterlay.exe` / `Iterlay`. `--app-path` chooses an executable; it does not change the workspace path. A live service at the selected workspace is reused before launching anything.

An explicit Node workspace, including on a machine with an App:

```sh
iterlay status --standalone --user-data-path /srv/iterlay --json
iterlay boards list --standalone --user-data-path /srv/iterlay --json
iterlay tasks get <task-id> --standalone --user-data-path /srv/iterlay --json
```

Use the actual user-supplied or already selected path; `/srv/iterlay` is an example, not a reason to create a new workspace. `--user-data-path` overrides `ITERLAY_USER_DATA_PATH`, which overrides the mode's default. Do not drop an existing environment value when continuing work. Installing an App can change automatic mode detection, so keep `--standalone` for an existing Node workspace.

Default directories:

| Platform | App | Standalone |
| --- | --- | --- |
| macOS | `~/Library/Application Support/Iterlay` | `~/Library/Application Support/Iterlay CLI` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/Iterlay` | `${XDG_DATA_HOME:-~/.local/share}/iterlay` |
| Windows | `%APPDATA%/Iterlay` | `%LOCALAPPDATA%/Iterlay CLI` |

`--no-launch` connects only to an existing service. In App mode, specifying a workspace path also disables auto-launch. A new standalone workspace can auto-launch even with an explicit path; to inspect without launching, add `--no-launch`.

App mode shares the App's current workspace; standalone mode owns a separate workspace. There is no automatic cross-mode or cross-host synchronization, nor a desktop client for remote Node workspaces. A request to transfer results requires explicit export and import into the target workspace, not repointing both runtimes at the same directory. Do not copy encrypted App credentials or read its settings to bootstrap Node.

## Server operation

Run CLI on the server, for example through an authorized SSH connection. The backend listens on local loopback with private discovery/authentication; there is no CLI remote-URL flag or public server API. A local `--user-data-path` does not address a remote directory.

When the user requests service setup, the foreground command is:

```sh
iterlay serve --user-data-path /var/lib/iterlay
```

Run that long-lived command under the requested process manager, or in a managed shell session when testing. It does not return until stopped. Use the same runtime user and directory for clients:

```sh
iterlay status --standalone --user-data-path /var/lib/iterlay --no-launch --json
```

Only stop a Node backend when shutdown is part of the user's task:

```sh
iterlay server stop --standalone --user-data-path /var/lib/iterlay --json
```

A shared service may have other active jobs. Ctrl+C on a client is not a reason to stop it. Graceful shutdown waits for accepted image work and video submissions to persist; video polling resumes from saved remote IDs after restart. Forced termination may leave remote results uncertain. An abandoned workspace lock normally expires after about 10 seconds; do not delete a live lock to bypass it.

## Installation and errors

| Observed problem | Next action |
| --- | --- |
| `iterlay` missing | Locate an existing installation first. App users can repair through Settings → Coding Agent; npm users need a package containing the Node backend and a supported Node version. Install only within the user's requested setup scope. |
| Several CLI executables on PATH | Inspect command resolution and choose the intended executable. Preserve that absolute executable across the workflow; do not overwrite an App launcher to fix ambiguity. |
| CLI lacks `--standalone` / `serve` | The installed package lacks this capability. Explain which installation needs updating; do not claim repository code is already released. |
| App connection unavailable | Check the chosen App/workspace and `--no-launch`. Do not silently switch to standalone, create a new workspace or duplicate credentials. |
| Node service not ready | Check the same workspace and permissions. If explicitly diagnosing startup, run `serve` there to expose the startup error; a live service/lock must not be replaced. |
| Task/board not found | Check host, executable, mode and path against the recorded context before interpreting this as missing data or generating again. |
| Unsupported operation | Compare installed CLI help/schema with the backend. An old App is not upgraded by replacing the CLI. Keep completed results and do not re-submit an uncertain job. |
| Missing model credentials | Inspect `providers list/show`. Reuse the right configured connection, or configure the requested service via environment/stdin; never inspect secrets on disk. |

`iterlay add --agent codex` or `--agent claude-code` installs this bundled Skill without requiring App model setup; it can migrate that Agent's legacy Iterlay MCP entry. Use installation commands only when the user requests the integration change. Skill installation is separate from runtime connection and model readiness; a new Agent session may be needed to load the updated skill.
