import { Type } from "typebox";

const text = () => Type.String({ minLength: 1, pattern: "\\S" });
const option = Type.Object({ label: text(), value: text() });
const field = Type.Object({
  id: text(),
  label: text(),
  type: Type.Union([Type.Literal("text"), Type.Literal("textarea"), Type.Literal("select")]),
  placeholder: Type.Optional(Type.String()),
  required: Type.Optional(Type.Boolean()),
  multiple: Type.Optional(Type.Boolean()),
  allowSupplement: Type.Optional(Type.Boolean()),
  options: Type.Optional(Type.Array(option))
});

export const assistantResultSchema = Type.Object({
  message: text(),
  mediaType: Type.Optional(Type.Union([Type.Literal("image"), Type.Literal("video")])),
  videoSettings: Type.Optional(Type.Object({
    durationSeconds: Type.Optional(Type.Number({ minimum: 1, maximum: 120 })),
    aspectRatio: Type.Optional(Type.String()),
    resolution: Type.Optional(Type.String())
  })),
  fields: Type.Array(Type.Object({ label: text(), value: text() }), { maxItems: 16 }),
  intent: Type.Optional(Type.Union([
    Type.Literal("direct"), Type.Literal("creative"), Type.Literal("chat")
  ])),
  goal: Type.Optional(Type.Union([
    Type.Literal("create"), Type.Literal("continue"), Type.Literal("vary"),
    Type.Literal("edit"), Type.Literal("explore"), Type.Literal("review"), Type.Literal("explain")
  ])),
  commitment: Type.Optional(Type.Union([
    Type.Literal("execute_now"), Type.Literal("prepare_only"), Type.Literal("advise_only")
  ])),
  suggestedName: Type.Optional(Type.String()),
  suggestedDescription: Type.Optional(Type.String()),
  detailedPrompt: Type.Optional(Type.String()),
  generationCount: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
  directions: Type.Optional(Type.Array(Type.Object({
    id: text(), title: text(), description: Type.Optional(Type.String()), prompt: text()
  }), { maxItems: 4 })),
  actions: Type.Optional(Type.Array(Type.Union([
    Type.Object({ type: Type.Literal("request_screen_capture"), reason: text() }),
    Type.Object({ type: Type.Literal("apply_prompt") }),
    Type.Object({ type: Type.Literal("generate") }),
    Type.Object({
      type: Type.Literal("set_generation_count"),
      count: Type.Integer({ minimum: 1, maximum: 99 })
    }),
    Type.Object({ type: Type.Literal("generate_directions"), directionIds: Type.Array(text()) }),
    Type.Object({
      type: Type.Literal("comic_drama_plan"),
      operation: Type.Union([
        Type.Literal("update-setting"), Type.Literal("propose-characters"),
        Type.Literal("update-character"), Type.Literal("create-segment"),
        Type.Literal("update-segment"), Type.Literal("create-media-chain")
      ]),
      instruction: text(),
      characterDrafts: Type.Optional(Type.Array(Type.Object({
        name: text(), role: text(), profile: text(), appearanceAnchors: Type.Array(text()),
        visualPrompt: text(), visualDescription: text(), required: Type.Boolean()
      })))
    })
  ]))),
  directorReview: Type.Optional(Type.Object({
    verdict: Type.Union([Type.Literal("approved"), Type.Literal("repaired")]),
    reasonCodes: Type.Array(Type.String())
  })),
  interaction: Type.Optional(Type.Union([
    Type.Object({
      type: Type.Literal("confirm"),
      title: text(),
      description: Type.Optional(Type.String()),
      confirmLabel: Type.Optional(Type.String()),
      cancelLabel: Type.Optional(Type.String())
    }),
    Type.Object({
      type: Type.Literal("form"),
      title: text(),
      description: Type.Optional(Type.String()),
      submitLabel: Type.Optional(Type.String()),
      cancelLabel: Type.Optional(Type.String()),
      fields: Type.Array(field, { minItems: 1, maxItems: 16 })
    })
  ]))
});
