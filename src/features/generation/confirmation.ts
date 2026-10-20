export interface GenerationConfirmationItem {
  id: string;
  label: string;
  task: string;
  costLabel: string;
  quoteId?: string;
  quoteExpiresAt?: string;
}

export interface GenerationConfirmationRequest {
  title: string;
  providerLabel: string;
  model: string;
  totalCostLabel: string;
  items: GenerationConfirmationItem[];
  confirmLabel: string;
}

