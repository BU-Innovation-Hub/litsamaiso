// Header a client sends to say which of the user's roles a request is made as
export const ACTIVE_ROLE_HEADER = "x-active-role";

const nameOf = (role: any): string => String((role && role.name) || role || "");

// The role a user is acting as for this request. requireAuth sets it when an account that holds
// more than one role (a Student who is also on the IEC) picks one; otherwise it's the primary role.
// It lives in $locals so a handler that saves the user can never store it as their real role.
export const activeRoleName = (user: any): string => {
  const active = user?.$locals?.activeRole;
  if (active) return String(active);
  return nameOf(user?.role);
};

// Every role the user holds, primary first. Additional roles count only once populated,
// so an unpopulated id is never mistaken for a role name.
export const heldRoleNames = (user: any): string[] => {
  const additional = (user?.additionalRoles ?? [])
    .map((role: any) => role?.name)
    .filter(Boolean)
    .map(String);
  const names = [nameOf(user?.role), ...additional].filter(Boolean);
  return [...new Set(names)];
};
