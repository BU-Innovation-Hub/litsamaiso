// Which of their roles a user with more than one (a Student on the IEC) is working as.
// Remembered per user, so someone else signing in on the same device starts fresh.
const STORAGE_KEY = 'activeRole';
export const ACTIVE_ROLE_HEADER = 'X-Active-Role';
const ACTIVE_ROLE_REVOKED_EVENT = 'litsamaiso:active-role-revoked';

interface StoredActiveRole {
  userId: string;
  role: string;
}

export const getStoredActiveRole = (userId?: string): string | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredActiveRole;
    if (userId && stored.userId !== userId) return null;
    return stored.role || null;
  } catch {
    return null;
  }
};

export const storeActiveRole = (userId: string, role: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, role } satisfies StoredActiveRole));
  } catch {
    // Storage can be unavailable on some mobile WebKit contexts; the choice lasts this session.
  }
};

export const clearStoredActiveRole = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};

// The API refused the role being sent, e.g. the user was removed from the IEC mid-session
export const notifyActiveRoleRevoked = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTIVE_ROLE_REVOKED_EVENT));
};

export const onActiveRoleRevoked = (handler: () => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(ACTIVE_ROLE_REVOKED_EVENT, handler);
  return () => window.removeEventListener(ACTIVE_ROLE_REVOKED_EVENT, handler);
};
