const PUBLIC_REGISTRATION_ALLOWED_ROLES = new Set(["student"]);
const PRIVILEGED_ROLES = new Set(["appadmin", "institutionadmin", "finance", "saad"]);

export type RegistrationErrorCode =
  | "missingFields"
  | "emailTaken"
  | "unsupportedRole"
  | "forbiddenRole"
  | "institutionDetailsRequired"
  | "studentNotFound"
  | "studentMismatch"
  | "institutionUnavailable"
  | "general";

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
    message: getFriendlyRegistrationErrorMessage("forbiddenRole"),
  } as const;
};

export const getFriendlyRegistrationErrorMessage = (
  code: RegistrationErrorCode,
): string => {
  switch (code) {
    case "missingFields":
      return "Please provide a valid email address, password, and account type.";
    case "emailTaken":
      return "This email address is already registered. Please sign in or use a different email.";
    case "unsupportedRole":
      return "The selected account type is not supported. Please choose a different option.";
    case "forbiddenRole":
      return "This account type cannot be created from the public sign-up form. Please contact an administrator.";
    case "institutionDetailsRequired":
      return "Please provide your institution name and institution email to continue.";
    case "studentNotFound":
      return "We could not find a student record for the details you provided. Please contact your institution administrator.";
    case "studentMismatch":
      return "The student details you entered do not match our records. Please check the student ID and email and try again.";
    case "institutionUnavailable":
      return "We could not verify the selected institution. Please contact an administrator.";
    case "general":
    default:
      return "We could not complete your registration request. Please try again or contact support.";
  }
};

export const isPrivilegedRole = (role: string): boolean => {
  const normalizedRole = normalizeRoleName(role);
  return PRIVILEGED_ROLES.has(normalizedRole);
};
