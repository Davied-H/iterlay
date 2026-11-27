# Iterlay

A free, open-source AI creative workspace. Generate, edit, and organize images and videos on one canvas, or let a coding agent operate it through the CLI. Boards and assets stay on your computer; your chosen model provider bills model usage.

[中文](README.zh-CN.md) · [Website](https://davied-h.github.io/iterlay/en/) · [Download](https://github.com/Davied-H/iterlay/releases)

## Quick install with a coding agent

Paste this into Codex, Claude Code, or another coding agent:

```text
Install Iterlay for me: https://github.com/Davied-H/iterlay
Read README.md and cli/README.md first. Check my OS and existing installation.
On a desktop, download the App installer matching my OS and architecture from Releases,
then run iterlay add --agent <current agent ID> to install the using-iterlay Skill.
If no matching installer exists, or I only need the CLI, follow the source installation
under “Install only the CLI”. Check the CLI, Skill, and connection when done.
Report missing model configuration without generating any images automatically.
```

After installation, invoke `$using-iterlay` in Codex or `/using-iterlay` in Claude Code, then describe the assets you want to generate, edit, or export.

## Manual installation

1. Download the installer matching your OS and architecture from [Releases](https://github.com/Davied-H/iterlay/releases), install it, and open Iterlay. Supported downloads depend on the published assets.
2. Add a provider, API key, and model in Settings, or authorize a Codex account.
3. Create a board, import a reference or enter a prompt, and start creating.

To connect a coding agent, install its Skill in **Settings → Coding Agent**, or run:

```bash
npx iterlay add --agent codex
# For Claude Code: npx iterlay add --agent claude-code
```

The App installs its bundled CLI on first launch. Reopen an existing terminal if needed. The Skill installation command requires Node.js 22.12+.

## Install only the CLI

Use the terminal or a headless server without the App or Electron. Requires Git, Node.js **22.12+**, and npm. The standalone runtime has not yet been published to npm; build from source containing this feature:

```bash
git clone https://github.com/Davied-H/iterlay.git
cd iterlay
npm ci --prefix cli
npm run build --prefix cli
npm install -g ./cli
iterlay status --standalone --json
```

Installing from a local directory links to the source, so keep that directory. Configure an image model, then generate an image (set `OPENAI_API_KEY` locally first):

```bash
iterlay providers set --standalone --kind image --provider images \
  --base-url https://api.openai.com --model gpt-image-1 \
  --api-key-env OPENAI_API_KEY --default --json
iterlay image generate --standalone --prompt "A minimalist coffee cup illustration" --out ./cup.png --json
```

Run `iterlay add --agent codex` to install the Skill. Standalone mode uses a separate workspace; App configuration, credentials, and boards do not sync automatically. Use `--standalone` to select it explicitly. See the [standalone guide (Chinese)](docs/cli-standalone.md) and [CLI reference (Chinese)](cli/README.md) for hosting, tarball installation, and more commands.

## Implemented features

These features are implemented in the current source. Older installers may differ, and generation capabilities depend on your provider and model.

| Area | Available features |
| --- | --- |
| Canvas and boards | Infinite canvas, image/text/video nodes, groups and connections, layouts, board search, undo/redo, autosave, and trash |
| Image generation and editing | Text-to-image, references, natural-language edits, annotation/mask briefs, image versions, and slider comparison |
| Image formats and delivery | Preserve originals; locally export PNG/JPEG/WebP with scaling, cropping, or padding; retry delivery separately; SVG/GIF require real generation verification |
| Video | Text-to-video, image-to-video, model-dependent first/last frames, remix and extension, task tracking, sequence editing, and MP4 export |
| Templates | Create, organize, import/export, extract templates from images, and compose prompts with references |
| Assets | Asset library, cross-board organization, slicing, individual/ZIP export, `.itb` board import/export, static and animated sticker exports |
| Coding agents and CLI | Install Skills, generate/edit, manage boards/templates/assets, inspect tasks, JSON output, standalone Node backend, and server operation |
| Models and settings | Multiple providers, API keys and Codex authorization, local storage, English/Chinese interface, and themes |
| Experimental extensions | Tool plugins, short-drama assistant, image reconstruction, and layer/PSD export |

Read more: [Detailed features](docs/features.en.md) · [Usage and FAQ](docs/usage.en.md) · [Creative workflow and examples](docs/creative-workflow.en.md) · [Product story](docs/product-story.en.md) · [Development and packaging](docs/development.md) · [Community and license](docs/community.en.md)

[MIT License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
