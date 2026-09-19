import { useAuth } from '../hooks/useAuth';

export const DEFAULT_LOGO_URL = '/logo-1.png';

/** Institution logo, falling back to the Litsamaiso mark. */
export const useInstitutionLogo = (): string => {
  const { user } = useAuth();
  return user?.institution?.theme?.logoUrl || DEFAULT_LOGO_URL;
};
