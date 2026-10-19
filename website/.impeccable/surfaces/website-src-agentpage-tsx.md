---
version: 1
slug: "website-src-agentpage-tsx"
primary_target: "website/src/AgentPage.tsx"
related_targets: ["website/src/agent-page.css", "website/src/main.tsx", "src/components/workbench/settings/AgentStarterGuide.tsx", "shared/agent-starter.ts"]
---

# Coding Agent workflow

Scope: `website/src/AgentPage.tsx`, `/agents`. Mode: Persuade followed by Read.

Audience: Developers using Codex or Claude Code who need project images and an understandable path to deliver them.

Job and action: See a finished example, inspect the actual inputs and versions, download the board or complete project, install the App and Skill, then copy a phase-specific task.

Proof: The real FIELD generated assets and prompts record, original orange-to-sage history in `examples/field/field-starter.itb`, browser screenshot of the completed static HTML site, and complete project `examples/field/field-starter.zip`. FIELD is a fictional brand. No made-up user counts or customer outcomes. `examples/field/field-review.mp4` records inspection and slider comparison of existing imported versions; it does not record new generation or an external agent run.

Direction: Extend the established white / graphite / quiet green site. The case leads with its finished website, then uses a flat four-image sequence and a three-step installation-to-delivery guide. Preserve the homepage, download page and Wiki.

Memorable moment: Open the same finished FIELD website and download its source project, then continue its real image history in Iterlay.

Constraints: English default at `/#/agents`, Chinese at `/#/agents?lang=zh`, matching document language, navigation, metadata and footer; English download links to GitHub Releases. The website makes no model calls or App launch. The copied CLI readiness task may start the App to connect. Provider billing, local asset storage and remote prompt/reference transfer are explicit. Agent installation does not isolate workspace, permissions or quota. Reuse the shared task generator with the App guide.

## Built ground truth — 2026-10-18

The first viewport places a direct offer beside the actual FIELD website screenshot. It links to that working static example, then shows four flat square assets in the order original → sage edit → outdoor scene → launch poster. The source record, `.itb` archive and project ZIP are separate usable links. The three ordered steps are prepare, copy a concrete task, and inspect/deliver.

Layout: a 1200px content limit with 40px minimum side gutters; hero columns .95fr/1fr and 80px gap; four equal image columns with 22px gap. At 1000px, gutters become 30px and main gaps 40px. At 760px, gutters become 20px and content becomes a normal single-column document; at 380px, the copy row stacks. The 320px English and 390px Chinese evidence preserve primary actions and task text without horizontal clipping.

Visual extraction: the scoped `agent-*` entries in `website/DESIGN.md` describe this page only. The page uses white, graphite `#202722`, muted green-grey `#626b61`, quiet green links and `#f3f4ef` sections, thin dividers and no custom content shadows. Hero is clamp(36px, 4.2vw, 60px)/550, section heading clamp(28px, 3.2vw, 40px)/550, intro 16px, usual body 13–14px, command 12px monospace and notes/status 10–12px. Mobile hero is 40px, then 36px at 380px; this does not redefine other site surfaces. Images have 8px corners, command/task fields 7px, actions pill corners.

Controls: language, agent and task mode are independent state. Choices use pressed states and underlines; long tasks are selectable read-only textareas. Clipboard failure selects the relevant text and offers keyboard recovery; feedback has `role=status`. Setup scrolling respects reduced motion.

Shared task contract:

- Check: read CLI status, image-provider metadata and tools; do not mutate a board or call a model. Saved configuration does not establish remote health, and tools do not prove the agent loaded its Skill.
- Create: explain provider/model, one image and provider charges; await confirmation before generation, keep a stable request ID, inspect the actual result and reuse the task after export failure.
- Deliver: import the existing FIELD `.itb` through the App, inspect remapped board/node IDs and versions, and export existing managed images without a model/provider requirement. Original orange → `hero.png`, outdoor → `scene.png`, poster → `campaign.png`, all under `./public/iterlay-starter/`; preserve existing files and the orange-to-sage history.

The App's Settings → Coding Agent → Start using embeds the same three tasks, a complete-task disclosure, archive download/import, and a return-to-board action. It keeps the existing settings tokens and compact type rather than borrowing this landing page's scale. Installation is not proof that a new agent session loaded the Skill.

## Finish evidence and limits

Independent finish disposition: `ship` (`/tmp/iterlay-finish-review.md`). Final evidence is `.impeccable/review/agents/desktop.png` (1440px), `mobile.png` (390px Chinese), `user-320.png` (320px English), `field-desktop.png`, `field-mobile.png`, `.impeccable/review/agent-settings-desktop.png`, and `.impeccable/review/field-imported-board.png`. The imported board evidence includes all four images and the v2/2 edit version.

This document records the implemented surface and existing verification evidence; it does not expand verification to every old route or paid generation. Deployment remains outside this implementation. The existing-version recording is evidence of review only; no new model-generation video or fabricated live execution is promised.
