---
name: iterlay-template-use
description: Apply an existing Iterlay template to concrete content without modifying the template.
---

# Template Use

- Keep fixed template rules unchanged.
- Resolve every variable from the user request, current fields, and references.
- Do not leave unresolved placeholders in the final prompt.
- Produce a complete instance ready for the existing generation confirmation flow.
- Never turn a template-use request into template editing.
