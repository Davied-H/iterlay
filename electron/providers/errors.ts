export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function normalizeProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof Error) {
    return new ProviderError("PROVIDER_ERROR", error.message);
  }

  return new ProviderError("PROVIDER_ERROR", "Unknown provider error");
}
