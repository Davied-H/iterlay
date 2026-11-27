# Usage and FAQ

[Back to README](../README.md)

1. **Install Iterlay.** Choose your system on the [download page](https://davied-h.github.io/iterlay/#/download). Available installers are listed in [GitHub Releases](https://github.com/Davied-H/iterlay/releases).
2. **Connect your models.** Add providers, API keys, and models in settings, or authorize a Codex account.
3. **Create your first board.** Import a reference or enter a prompt, then select the result to keep refining.

### Supported model services

- **Image generation and editing:** OpenAI-compatible endpoints, OpenRouter, Alibaba Cloud Bailian, Volcengine Ark, Poe, fal.ai, Codex OAuth.
- **Video generation:** Volcengine Ark, fal.ai, OpenRouter, MiniMax.
- **Chat and creative assistance:** OpenAI-compatible endpoints, Codex OAuth.

Configure these capabilities separately. Image editing, references, text-to-video, image-to-video, and available parameters depend on the selected model and API. A provider integration does not imply support for every capability. Iterlay does not sell hosted model credits or top-ups.

## Want your agent to help?

See the [FIELD walkthrough](https://davied-h.github.io/iterlay/en/agents/) for the finished sample website, an importable board with real images and version history, and copyable tasks for setup, creation, and delivery. Opening the example does not run a model; creating new images uses your configured provider.

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

See the [CLI and agent integration guide (Chinese)](../cli/README.md) for more.

## FAQ

<details>
<summary><strong>Is Iterlay free? Do I need an activation code?</strong></summary>

The App is permanently free and needs no activation. Its original code is MIT licensed. Model calls are billed by the provider you choose; Iterlay does not sell model credits.

</details>

<details>
<summary><strong>Can I use it without a coding agent?</strong></summary>

Yes. Use the desktop canvas directly to import, generate, edit, compare, and export. CLI and Skills are optional ways to automate the same workspace.

</details>

<details>
<summary><strong>Is it offline? Where does my work go?</strong></summary>

Boards and assets are stored locally. Remote generation and chat require network access and send the relevant prompts and reference assets to your chosen provider. Local storage does not make a remote model run offline.

</details>

<details>
<summary><strong>Does every listed provider support every feature?</strong></summary>

No. Image edits, reference limits, transparent output, video duration, first/last frames, remix, and extension depend on the provider and model. Configure image, video, and text capabilities separately.

</details>

<details>
<summary><strong>Can I try the example without paying for a generation?</strong></summary>

Yes. Open the [finished FIELD website](https://davied-h.github.io/iterlay/en/agents/) or import its [board package](../website/public/examples/field/field-starter.itb). Viewing the existing assets does not call a model. Generating a new version uses your configured provider.

</details>

<details>
<summary><strong>Is the browser development mode a hosted web app?</strong></summary>

No. `pnpm dev` runs a browser frontend backed by a local hidden Electron service, with separate development data. Desktop installers are the regular end-user entry point.

</details>
