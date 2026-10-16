<div align="center">

# Iterlay

### Turn ideas into visuals, one iteration at a time.

An open-source AI visual workspace. Bring references, image generation, editing, and video creation onto one infinite canvas — and let your coding agents work there too.

**Your models · Infinite canvas · Agent tools · MIT licensed**

[Download Iterlay](https://github.com/Davied-H/iterlay/releases) · [Website](https://davied-h.github.io/iterlay/) · [Connect your agent](#give-your-agent-visual-tools) · [简体中文](README.zh-CN.md)

</div>

![The current Iterlay workspace with a FIELD speaker brief, orange product shot, green colorway, outdoor scene, and brand poster on one board](docs/assets/readme/field-canvas.webp)

One speaker, from a product shot to color exploration, an outdoor scene, and a brand poster. **Your references, experiments, and outputs stay together.**

Codex created this example through the Iterlay CLI using the App's configured model. Screenshots show the current browser workspace. See the [example assets, prompts, and production notes](docs/readme-example.md).

## Why Iterlay?

### Keep the context behind every iteration

Arrange references, generated images, and assets on an infinite canvas. Select an image to describe your next change, or use an existing result as a reference. Version comparison and generation history help you revisit earlier directions.

### Choose your models. Reuse your setup.

Bring your own API keys or authorize a Codex account. Choose image, video, and chat models for different tasks, with multiple providers in one workspace. Agents can reuse the models and credentials already configured in the App.

### You direct. Your agent executes.

Give Codex, Claude Code, and other coding agents CLI tools and a Skill to generate images, edit assets, create videos, arrange boards, and export files. Review and adjust results on the canvas, or have your agent export assets into the project you are building.

### Local workspace. Free, open-source tools.

Boards and assets are stored on your computer. Original code for the desktop app, canvas, AI integrations, CLI, and website is MIT licensed, so you can modify and build it yourself. The app is permanently free, with no activation required; model providers charge for their usage. When you use a remote model, prompts and required reference assets are sent to that provider.

## From reference to usable assets

### 1. Start with a reference

Import an existing image or generate one from a prompt. Keep style references, product images, and candidate directions together to guide your next step.

### 2. Refine on the canvas

Select a result and describe the background, object, or style you want to change. The image editing assistant uses the current image to help clarify what should change and what should stay.

![The current image editing assistant recognizes the FIELD speaker and offers options for changing its body color, background, lettering, loop, or lighting](docs/assets/readme/field-edit.webp)

### 3. Compare before you commit

Change the product from burnt orange to sage green while keeping the original and edited image in the same node. Drag the comparison slider to inspect the changes before choosing a version.

![A slider comparison of the actual FIELD speaker edit: orange original on the left, green version on the right](docs/assets/readme/field-versions.webp)

### 4. Organize and deliver

Slice images into reusable assets, organize them across boards and the asset library, then export them for design or development. For motion, use supported models to generate video from text or images.

## What can you make?

- **Product and commerce visuals:** Explore scenes, backgrounds, and lighting from a product reference, then compare presentation options.
- **Content and brand assets:** Create posters, covers, and social graphics with references and candidate directions on the same board.
- **Assets for design and development:** Ask your coding agent to generate illustrations, backgrounds, and images, then export them into your project.
- **Video concepts:** Generate video from text or an existing image and organize it alongside your still visuals.

## Get started

1. **Install Iterlay.** Choose your system on the [download page](https://davied-h.github.io/iterlay/#/download). Available installers are listed in [GitHub Releases](https://github.com/Davied-H/iterlay/releases).
2. **Connect your models.** Add providers, API keys, and models in settings, or authorize a Codex account.
3. **Create your first board.** Import a reference or enter a prompt, then select the result to keep refining.

### Supported model services

- **Image generation and editing:** OpenAI-compatible endpoints, OpenRouter, Alibaba Cloud Bailian, Volcengine Ark, Poe, fal.ai, Codex OAuth.
- **Video generation:** Volcengine Ark, fal.ai, OpenRouter, MiniMax.
- **Chat and creative assistance:** OpenAI-compatible endpoints, Codex OAuth.

Configure these capabilities separately. Image editing, references, text-to-video, image-to-video, and available parameters depend on the selected model and API. A provider integration does not imply support for every capability. Iterlay does not sell hosted model credits or top-ups.

## Give your agent visual tools

Let Codex or Claude Code create visual assets as part of your existing workflow.

Install and open Iterlay, configure a model, then install the Skills from **Settings → Coding Agent**, or run:

```bash
npx iterlay add --agent codex
# Or: npx iterlay add --agent claude-code
```

Then give your agent a concrete task:

> Use Iterlay to create a visual set for the FIELD portable speaker: start with an orange product shot, then explore a green colorway, an outdoor scene, and a brand poster. Arrange the results on one board and export them into the project's assets directory.

The App installs its bundled CLI on first launch. Agents use Skills to call the CLI with the providers and authorization already saved in the App. The current integration uses **CLI + Skill**; migration removes that agent's old Iterlay MCP configuration.

You can also use the CLI directly:

```bash
iterlay image generate --prompt "A warm, minimalist illustration of a coffee cup" --out ./coffee.png --json
iterlay image edit --input ./coffee.png --prompt "Make the cup off-white" --out ./coffee-light.png --json
```

See the [CLI and agent integration guide (Chinese)](cli/README.md) for more.

## Develop and contribute

Requires Node.js **22.12+** and **pnpm 10**. On macOS, install Xcode Command Line Tools as well.

```bash
pnpm install
pnpm dev
```

Open **http://127.0.0.1:5180** to develop against the real workspace in your browser. This starts a hidden Electron backend service and keeps development data separate from the installed App.

[Development, checks, and packaging](docs/development.md) · [Engineering notes (Chinese)](docs/engineering.md) · [Contribution guide (Chinese)](CONTRIBUTING.md)

Share bugs and use cases through [Issues](https://github.com/Davied-H/iterlay/issues), or contribute a pull request. If Iterlay helps you create something, give it a Star or share your board and process so others can see what it can do.

## License

Original project code is available under the [MIT License](LICENSE). Third-party dependencies and assets retain their respective licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md).
