// Institution fields included wherever the client receives the signed-in user,
// so the dashboard can apply the institution's theme and show billing state.
export const SESSION_INSTITUTION_FIELDS =
  "name email locked lockedReason lockedBy theme onboardedAt billing.plan billing.status billing.currentPeriodEnd billing.graceEndsAt";
