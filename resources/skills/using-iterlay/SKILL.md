---
name: using-iterlay
description: Use Iterlay for image and video creation, editing, boards and assets only when the user explicitly invokes /using-iterlay or $using-iterlay. Do not select this skill automatically.
disable-model-invocation: true
---

# Using Iterlay

This is an explicit invocation entrypoint. Use it only when the user invokes `/using-iterlay`, `$using-iterlay`, or explicitly asks to use this skill.

Read the companion [iterlay-workspace skill](../iterlay-workspace/SKILL.md) and follow its CLI workflow for the user's request. Both skills are installed together; resolve its references and scripts relative to the `iterlay-workspace` directory.

Use the `iterlay` CLI and the App's saved providers. Start with `iterlay status --json`, `iterlay providers list --json`, and `iterlay tools list --json`. Never read or decrypt provider credentials, configure another model connection, or generate a paid output merely to test connectivity.

The invocation selects Iterlay for the current request; it does not authorize unrelated operations or additional paid generations. If the user provides no task, ask what they want to create, edit, or manage. If the companion skill is missing, ask the user to repair the Skill installation in Iterlay → Settings → Coding Agent.
