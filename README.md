# Iterlay

**A bring-your-own-key AI visual workspace where you and your agents generate and refine images and videos on an infinite canvas.**

English · [简体中文](README.zh-CN.md)

<!-- Add a 60–90 second real workflow recording here: start a generation, show the actual wait, revise the result, and show final image and video outputs. Label any speedups or cuts. Do not substitute animations or a screenshot slideshow for real use. -->

## Download and get started

[Download installers](https://github.com/Davied-H/iterlay/releases) · [Choose your platform](https://davied-h.github.io/iterlay/#/download) · [Website](https://davied-h.github.io/iterlay/)

1. Download an installer for your system, install it, and open Iterlay. Releases determine build availability; the download page groups builds for Apple silicon, Intel Macs, and Windows x64.
2. Configure your AI providers, API keys, and models in settings. No activation or trial is required.
3. Create a board and enter a prompt to generate an image or video. Use a result as a reference to continue refining your work.

To let Codex or Claude Code work with your canvas, install the desktop app, then run:

```bash
npx iterlay add
```

The CLI detects installed agents, installs the Iterlay Skill, and configures its MCP server. See the [agent integration guide (Chinese)](cli/README.md).

## Chat, Image, and Video providers

- **Chat (conversation and creative assistance):** OpenAI-compatible endpoints, Codex OAuth.
- **Image (generation and editing):** OpenAI-compatible endpoints, OpenRouter, Alibaba Cloud Bailian, Volcengine Ark, Poe, fal.ai, Codex OAuth.
- **Video (generation):** Volcengine Ark, fal.ai, OpenRouter, MiniMax.

Configure these capabilities separately: a provider integration does not imply support for all three. Custom endpoints require the corresponding service URL, API key, and model; Codex OAuth uses account authorization. Image editing, text-to-video, image-to-video, and available parameters depend on the selected model and API. Your providers bill usage of your own keys.

## Open source and services

Iterlay is permanently free, with no activation or trial requirements. Original code for the desktop app, canvas, AI integrations, CLI, and website is licensed under MIT.

The client does not offer hosted Iterlay model services, credits, or purchase flows. Configure your own model providers using API keys or a Codex account; the respective providers bill model usage. Updates and installers are delivered through GitHub Releases, without the paid edition's licensing, account, or update services.

## The canvas workflow

![Screenshot of the Iterlay infinite canvas workspace](website/public/iterlay-demo-board.png)

- **Infinite canvas:** Keep images, references, and results together with their context.
- **Generate and refine:** Create images and videos with AI, then iterate using reference material.
- **References and slicing:** Bring existing images into your workflow and split them into reusable assets.
- **Versions and history:** Compare image versions and review past generations.
- **Asset organization:** Organize creative materials across boards and your workspace.

## Local development

Requirements:

- Node.js **22.12+** and **pnpm 10**.
- On macOS, Xcode Command Line Tools (`xcode-select --install`). The native image-layer component uses the macOS 14 SDK.

```bash
pnpm install
pnpm electron:dev
```

Run the project checks:

```bash
pnpm test
pnpm lint
pnpm build
```

### Repository layout

- `src/` — React canvas and desktop interface.
- `electron/` — Electron main process and desktop services.
- `cli/` — Coding-agent integration CLI and its [documentation](cli/README.md).
- `website/` — Product website and download page; see its [development guide (Chinese)](website/README.md).
- `resources/` — Bundled skills, icons, and native resources.
- `docs/` — Product notes and maintainer documentation.

## Contributing

Report bugs through [GitHub Issues](https://github.com/Davied-H/iterlay/issues) or submit improvements via pull requests. Read the [contribution guide (Chinese)](CONTRIBUTING.md) before contributing.

## Local packaging

```bash
pnpm build
pnpm package
```

`pnpm package` creates an application directory under `release/`. On Apple silicon Macs, `pnpm release` builds an unsigned, unnotarized ARM64 DMG using UDZO compression. Both commands audit the packaged app: no renderer-only dependency trees, production JavaScript source maps, or bundled FFmpeg; app and ASAR budgets are 380 MiB and 120 MiB. The report is saved to `output/package-size/report.json`. These commands do not upload installers, require official admin credentials, commit, or push Git changes.

The app downloads its video tools only after asking on the first operation that needs them. The versioned component comes from GitHub Releases, is verified with SHA-256, and is stored under Electron's user-data directory at `tools/ffmpeg/ffmpeg6-r1/darwin-arm64/`. Once installed, it works offline and survives app updates. A failed or cancelled download prevents a new sequence generation from being submitted or charged. Image work and ordinary startup do not download the component.

Maintainers build the component separately on an Apple silicon Mac with Xcode Command Line Tools and `brew install pkgconf`:

```bash
pnpm media-tools:build --version ffmpeg6-r2
pnpm media-tools:verify
```

This compiles pinned FFmpeg 6.0 and x264 sources without nonfree components and retains the existing codec configuration. The archive under `output/media-tools/<version>-darwin-arm64/` contains both executables, licenses, matching source archives, and build information. The build writes exact archive/file hashes into `shared/media-tools-manifest.json`. Component revisions are immutable: use a new `--version` for each changed build. With no arguments, the command verifies and reuses a matching local archive; `--rebuild` writes an isolated diagnostic candidate and refuses to change a pinned version's hashes. The current `ffmpeg6-r1` asset is `iterlay-media-tools-ffmpeg6-r1-darwin-arm64.zip` on GitHub Release `media-tools-ffmpeg6-r1`. Publish each new component before shipping an app that references it; publishing is a separate maintainer action. Other platforms lack complete packaging dependencies. Maintainers must configure signing, notarization, and distribution themselves. See [Third-party notices](THIRD_PARTY_NOTICES.md).

## License

Original project code is available under the [MIT License](LICENSE). Third-party dependencies and assets retain their respective licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md).
