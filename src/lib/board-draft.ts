import type { GenerateImageInput, PromptSpec } from "@shared/types";
import { getDefaultUseCase } from "@shared/workflow";

const emptyPromptSpec: PromptSpec = {
  primaryRequest: "",
  assetType: "",
  inputImages: "",
  sceneBackdrop: "",
  subject: "",
  styleMedium: "",
  compositionFraming: "",
  lightingMood: "",
  colorPalette: "",
  materialsTextures: "",
  verbatimText: "",
  constraints: "",
  avoid: ""
};

export function createEmptyPromptSpec(): PromptSpec {
  return { ...emptyPromptSpec };
}

/** Clear board-owned draft content while retaining the user's generation preferences. */
export function resetBoardDraft(input: GenerateImageInput): GenerateImageInput {
  return {
    workflowMode: "generate",
    useCase: getDefaultUseCase("generate"),
    promptSpec: createEmptyPromptSpec(),
    prompt: "",
    model: input.model,
    size: input.size,
    n: input.n,
    quality: input.quality,
    style: input.style,
    background: input.background,
    outputFormat: input.outputFormat,
    referenceImages: []
  };
}
