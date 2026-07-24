const PUBLIC_REGISTRATION_ALLOWED_ROLES = new Set(["student"]);
const PRIVILEGED_ROLES = new Set(["appadmin", "institutionadmin", "finance", "saad"]);

export const normalizeRoleName = (role: string): string => {
  return role.trim().toLowerCase();
};

export const isPublicRegistrationAllowed = (role: string): boolean => {
  const normalizedRole = normalizeRoleName(role);
  return PUBLIC_REGISTRATION_ALLOWED_ROLES.has(normalizedRole);
};

export const getPublicRegistrationError = (role: string) => {
  return {
    status: 403,
    message:
      "This role cannot be created through public registration. Please contact an administrator.",
  } as const;
};

export const isPrivilegedRole = (role: string): boolean => {
  const normalizedRole = normalizeRoleName(role);
  return PRIVILEGED_ROLES.has(normalizedRole);
};
