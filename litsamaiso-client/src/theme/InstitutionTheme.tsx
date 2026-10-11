import { useEffect, useLayoutEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/authService';
import { applyThemeVariables, buildThemeVariables, clearThemeVariables } from './palette';

let refreshedThisSession = false;

/**
 * Applies the signed-in user's institution theme to the document while the
 * logged-in layout is mounted, and restores the Litsamaiso defaults when it
 * unmounts (logout, or navigating to public/marketing pages).
 *
 * It also refreshes the institution (theme, billing state) once per page
 * load, so changes made by the Institution Admin or by billing reach
 * everyone without them signing out and in again.
 */
export const InstitutionThemeBridge = () => {
  const { user, setUser } = useAuth();
  const theme = user?.institution?.theme;

  useLayoutEffect(() => {
    applyThemeVariables(buildThemeVariables(theme));
    return () => clearThemeVariables();
  }, [theme]);

  useEffect(() => {
    if (refreshedThisSession || !user?.institution) return;
    refreshedThisSession = true;
    authService
      .getProfile()
      .then(({ data }) => {
        if (!data.institution || typeof data.institution === 'string') return;
        const next = { ...user, institution: { ...user.institution, ...data.institution } };
        if (JSON.stringify(next.institution) === JSON.stringify(user.institution)) return;
        authService.updateStoredUser(next);
        setUser(next);
      })
      .catch(() => {
        refreshedThisSession = false;
      });
  }, [user, setUser]);

  return null;
};
