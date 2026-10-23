import { AssistantPermissionCard } from "./AssistantPermissionCard";
import { CreateQuestionCard } from "./AssistantDecisionCards";
import { AssistantConfirmationCard } from "./AssistantConfirmationCard";
import type {
  AiAssistantInteractionState,
  AiAssistantInteractionValues,
} from "./assistant-types";

interface Props {
  state: AiAssistantInteractionState;
  disabled: boolean;
  onSubmit?: (values: AiAssistantInteractionValues) => void;
  onDismiss?: () => void;
  onRefine?: (value: string) => void;
  onGenerate?: () => void;
}
export function AssistantInteraction(props: Props): React.ReactElement {
  const { state, disabled, onSubmit, onDismiss, onRefine, onGenerate } = props;
  if (state.interaction.type === "permission")
    return (
      <AssistantPermissionCard
        key={state.id}
        interaction={state.interaction}
        disabled={disabled}
        onDecision={(decision) =>
          decision === "deny"
            ? onDismiss?.()
            : onSubmit?.({ permissionDecision: decision })
        }
      />
    );
  if (state.interaction.type === "form")
    return (
      <CreateQuestionCard
        key={state.id}
        interaction={state.interaction}
        disabled={disabled}
        allowSupplements
        onSubmit={(answers) => onSubmit?.(answers)}
        onDismiss={() => onDismiss?.()}
      />
    );
  return (
    <AssistantConfirmationCard
      key={state.id}
      state={state}
      disabled={disabled}
      onApply={() => onSubmit?.({})}
      onGenerate={() => onGenerate?.()}
      onDismiss={() => onDismiss?.()}
      onRefine={(value) => onRefine?.(value)}
    />
  );
}
