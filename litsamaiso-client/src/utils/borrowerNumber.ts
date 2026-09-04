/**
 * Borrower numbers do not have a stable length: older records are 12 digits,
 * newer ones are 9, and NMDS may issue other lengths in future. So we validate
 * the *shape* (digits only, within a configurable range) instead of an exact
 * length. The authoritative check stays server-side, where the number is looked
 * up against the imported financial clearance records.
 *
 * To change the accepted range, set the env vars below — no code change needed:
 *   VITE_BORROWER_NUMBER_MIN_DIGITS
 *   VITE_BORROWER_NUMBER_MAX_DIGITS
 */

const readDigitBound = (value: unknown, fallback: number): number => {
  const parsed = Number(String(value ?? '').trim());
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
};

export const BORROWER_NUMBER_MIN_DIGITS = readDigitBound(
  import.meta.env.VITE_BORROWER_NUMBER_MIN_DIGITS,
  6,
);

export const BORROWER_NUMBER_MAX_DIGITS = Math.max(
  BORROWER_NUMBER_MIN_DIGITS,
  readDigitBound(import.meta.env.VITE_BORROWER_NUMBER_MAX_DIGITS, 20),
);

/** Strips separators students paste in (spaces, dashes) so "2022 1100 1706" is accepted. */
export const normalizeBorrowerNumber = (value: unknown): string =>
  String(value ?? '').replace(/[\s-]/g, '');

export const isValidBorrowerNumber = (value: unknown): boolean => {
  const normalized = normalizeBorrowerNumber(value);
  return new RegExp(
    `^\\d{${BORROWER_NUMBER_MIN_DIGITS},${BORROWER_NUMBER_MAX_DIGITS}}$`,
  ).test(normalized);
};

/** Human-readable rule, used for error messages and field hints. */
export const borrowerNumberRule = (): string =>
  BORROWER_NUMBER_MIN_DIGITS === BORROWER_NUMBER_MAX_DIGITS
    ? `exactly ${BORROWER_NUMBER_MIN_DIGITS} digits`
    : `${BORROWER_NUMBER_MIN_DIGITS}–${BORROWER_NUMBER_MAX_DIGITS} digits`;

export const borrowerNumberError = (): string =>
  `Borrower number must be ${borrowerNumberRule()} (numbers only)`;
