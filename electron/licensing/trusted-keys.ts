import type { GrantKeyring } from "./grant.js";

/** Built-in verification keys. Matching production private keys stay server-side. */
export const BUILTIN_GRANT_KEYS: GrantKeyring = {
  "primary-2026": `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGlAmGDTwJjWtO+eT7mGsLpvRhATovUI5nYvwy5neoBU=
-----END PUBLIC KEY-----`,
  "prod-2026-07": `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA0S8Hlm57vztF1Mneb21jrlkh5AzLGB5Syym1e2biIZ0=
-----END PUBLIC KEY-----`
};
