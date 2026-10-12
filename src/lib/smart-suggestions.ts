export function resolveEditSmartSuggestionsEnabled(
  preference: boolean | undefined,
  textProviderReady: boolean
): boolean {
  return textProviderReady && preference === true;
}
