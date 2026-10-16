# Development and packaging

[Back to README](../README.md)

## Local development

Requirements:

- Node.js **22.12+** and **pnpm 10**.
- On macOS, Xcode Command Line Tools (`xcode-select --install`). The native image-layer component uses the macOS 14 SDK.

```bash
pnpm install
pnpm dev
```

Open **http://127.0.0.1:5180** in your browser. `pnpm dev` (or `pnpm dev:web`) starts Vite and a hidden Electron service process, so the browser uses real boards, settings, generation tasks, and native media services. Renderer changes use Vite hot reload; changes to Electron services rebuild and restart the backend. Stop everything with Ctrl+C.

Backend restarts and shutdown wait for pending board saves. If the workspace stays open because saving failed, development services remain available and automatic restarts pause. Resolve the save error in the browser, then press Ctrl+C again; the launcher never force-kills the workspace.

Browser development stores its data separately in `tmp/browser-dev/user-data/`; existing app data stays separate. Set `ITERLAY_BROWSER_DEV_USER_DATA` to choose another development directory. The authenticated bridge listens on loopback and starts only in this development mode. Packaged apps keep using Electron IPC.

Use the browser for routine debugging and verification. Run `pnpm electron:dev` for visible desktop app testing only when explicitly requested, including native window and application lifecycle behavior. `pnpm dev:ui` retains the standalone Vite server for isolated UI previews without backend services.

Run the project checks:

```bash
pnpm setup:subprojects
pnpm check:all
```

`setup:subprojects` installs the CLI and website dependencies using their own lockfiles. `check:all` covers type checks, lint, tests, and builds across all four projects. Use `pnpm typecheck`, `pnpm lint`, or `pnpm test` for focused checks. After building Electron, run `pnpm bench:storage` for a storage benchmark with temporary fixtures. See the [engineering notes (Chinese)](engineering.md) for module boundaries, persistence formats, compatibility, and measured results.

### Repository layout

- `src/` — React canvas and desktop interface.
- `electron/` — Electron main process and desktop services.
- `cli/` — Coding-agent integration CLI and its [documentation](../cli/README.md).
- `website/` — Product website and download page; see its [development guide (Chinese)](../website/README.md).
- `resources/` — Bundled skills, icons, and native resources.
- `docs/` — Product notes and maintainer documentation.

## Local packaging

```bash
pnpm build
pnpm package
```

`pnpm package` creates an application directory under `release/`. `pnpm release` builds an unsigned, unnotarized macOS ARM64 DMG using UDZO compression. Use `pnpm release --platform mac --arch all` on macOS for ARM64 and Intel x64 DMGs, or `pnpm release --platform win --arch all` in Git Bash on Windows for separate ARM64 and x64 NSIS installers. `--arch arm64` and `--arch x64` build a single architecture. The manually dispatched `Build desktop release packages` workflow runs this same script for all four variants. Packaging audits exclude development modules, renderer-only dependency trees, production JavaScript source maps, and bundled FFmpeg; app budgets are 380 MiB on macOS and 480 MiB on Windows (whose Electron runtime is larger), with a shared ASAR budget of 120 MiB. Reports are saved to `output/package-size/`. These commands and the workflow do not publish a GitHub Release.

The app downloads its video tools only after asking on the first operation that needs them. The versioned component comes from GitHub Releases, is verified with SHA-256, and is stored under Electron's user-data directory at `tools/ffmpeg/ffmpeg6-r1/darwin-arm64/`. Once installed, it works offline and survives app updates. A failed or cancelled download prevents a new sequence generation from being submitted or charged. Image work and ordinary startup do not download the component.

Maintainers build the component separately on an Apple silicon Mac with Xcode Command Line Tools and `brew install pkgconf`:

```bash
pnpm media-tools:build --version ffmpeg6-r2
pnpm media-tools:verify
```

This compiles pinned FFmpeg 6.0 and x264 sources without nonfree components and retains the existing codec configuration. The archive under `output/media-tools/<version>-darwin-arm64/` contains both executables, licenses, matching source archives, and build information. The build writes exact archive/file hashes into `shared/media-tools-manifest.json`. Component revisions are immutable: use a new `--version` for each changed build. With no arguments, the command verifies and reuses a matching local archive; `--rebuild` writes an isolated diagnostic candidate and refuses to change a pinned version's hashes. The current `ffmpeg6-r1` asset is `iterlay-media-tools-ffmpeg6-r1-darwin-arm64.zip` on GitHub Release `media-tools-ffmpeg6-r1`. Publish each new component before shipping an app that references it; publishing is a separate maintainer action. Other platforms lack complete packaging dependencies. Maintainers must configure signing, notarization, and distribution themselves. See [Third-party notices](../THIRD_PARTY_NOTICES.md).
