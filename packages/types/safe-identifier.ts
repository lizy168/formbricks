/**
 * Validates that a string is a safe identifier.
 * Safe identifiers can only contain lowercase letters, numbers, and underscores.
 * They cannot start with a number.
 *
 * Lives in `packages/types` so every declared field key validates through one rule —
 * Embedded Data keys, variables, hidden fields and contact attribute keys.
 * ENG-1834 routes the remaining call sites (and the apps/web copy) onto this helper.
 */
export const isSafeIdentifier = (value: string): boolean => {
  // Must start with a lowercase letter
  if (!/^[a-z]/.test(value)) {
    return false;
  }
  // Can only contain lowercase letters, numbers, and underscores
  return /^[a-z0-9_]+$/.test(value);
};
