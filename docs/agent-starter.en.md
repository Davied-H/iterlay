# FIELD: from coding agent to website assets

[中文](agent-starter.md) · [Original production record](readme-example.md)

A complete fictional speaker example for generating, editing, comparing and delivering visual assets with a coding agent. Start with the existing results: **no model call or paid generation is required**.

## Start with a usable result

1. Download `field-starter.zip` from the Agent page, unzip it and open `site/index.html`. This is an offline static website: no build step, account or external CDN. Its orange/green controls switch between the actual original and edited images.
2. In the Iterlay board list, choose **Import board** and open `field-starter.itb`; you can also drop the `.itb` into the workbench. Find **FIELD · 便携音箱视觉探索**. If names are duplicated, identify the newly imported board before proceeding.
3. The board contains the original burnt-orange product image, a sage editing node, outdoor image and poster. The sage node preserves the real orange v1 → sage v2 history. Orange is both the original and the reference for the other three images; sage is an edit variant.
4. Open Settings → Coding Agent and install the CLI and the Skill for your agent. In your project's terminal, invoke `$using-iterlay` in Codex or `/using-iterlay` in Claude Code, then give it the delivery task below.

After installation, an existing terminal may need to be reopened; alternatively use the launcher path shown in settings. The CLI may start Iterlay to establish its local connection. You do not need to read App settings files or share your API key with the agent.

## Give your agent the delivery task

Invoke the corresponding Skill first, then paste:

> Deliver the FIELD example I imported using Iterlay, without calling a model. Run `iterlay status --json`, then `iterlay boards list --json`, find “FIELD · 便携音箱视觉探索”, and inspect nodes and versions with `iterlay boards show <returned-board-id> --json`. Ask me to choose if names are duplicated. Import remaps IDs, so do not use the original example IDs. Select the original burnt-orange product image for `hero.png`, the outdoor image for `scene.png`, and the poster for `campaign.png`. Sage is an edit variant; preserve the orange-to-sage version history. Export to `./public/iterlay-starter/` with `iterlay assets export --path <returned-managed-path> --out <destination> --json`. Preserve existing files and do not use `--overwrite`. Verify the three files exist and check actual dimensions, then return their nodes/versions and paths.

There is currently no CLI command to import `.itb` board archives; import them in the App. To select an existing version, first read the actual `set_image_version` schema from `iterlay tools list --json`. Do not regenerate an image just to choose an earlier version.

| File | Source | Website use |
| --- | --- | --- |
| `hero.png` | Original burnt-orange product image | Product hero |
| `scene.png` | Outdoor result using the original as reference | Lifestyle section |
| `campaign.png` | Poster using the original as reference | Campaign section |
| `sage-variant.png` (optional) | Actual orange → sage edit | Color switch; optional delivery |

The example HTML uses smaller WebP copies. The agent exports the original generated PNGs contained in `.itb`. Both are actually 1254 × 1254; no WebP was renamed to PNG.

## Create your own first image

The website and App installation guide offer three tasks: **Check readiness**, **Create one image**, and **Deliver the existing example**. Readiness checks report the local connection and saved configuration without calling a model. Listed provider settings do not prove remote availability, and tool discovery does not prove the Skill is loaded.

The creation task states the provider, model and billing source, waits for your confirmation, then generates exactly one image and exports it to `./public/iterlay-starter/hero.png`. Existing files are preserved. If generation succeeds but export fails, export the same task again instead of submitting another paid request.

## Review the actual versions

[Watch the FIELD version review](../website/public/examples/field/field-review.mp4): open existing results in the real browser workspace, switch between the orange original and sage edit, then drag the comparison slider. The recording uses existing assets without calling a model. The complete example project includes this video.

## Provenance, model and reproduction limits

- On 2026-10-16, Codex actually made these four images through the Iterlay CLI in an isolated browser development workspace. The `.itb` was exported from that board and its four successful jobs. It preserves the original layout, PNG bytes, timestamps and version chain; delivery notes were added, and provider names/IDs and local paths were removed.
- `prompts.json` contains the complete actual prompts, original task IDs, output hashes, reference roles and delivery mapping. `history.json` inside `.itb` preserves actual generation/edit inputs, rather than a reconstructed execution history.
- The original service was OpenAI-compatible, using `gpt-image-1`. Requested size was 1024 × 1024; actual output was 1254 × 1254. An initial request rejected the default `style` parameter; the successful jobs used an empty style. This example does not claim success on the first attempt.
- Importing and exporting existing results does not call a model. Re-running prompts uses your provider and its billing rules. Other providers/models may change dimensions, product shape, reference fidelity and lettering; pixel-identical reproduction is not guaranteed.
- Board connections explain visual relationships; they are not an automatically executed workflow. The static HTML website was added as a project-delivery example and is not presented as part of the original generation run.

## Maintainer workflow

Run `node scripts/build-agent-starter.mjs` to rebuild the distribution from the committed `.itb` and validate its source media without connecting to a model. Use `node scripts/build-agent-starter.mjs --from-dev` only to refresh from the documented isolated development board. The script never accesses installed App data or reads provider settings.
