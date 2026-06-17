import type { User } from '../types';

const normalizeRoleName = (roleName: string): string => {
  const normalized = roleName.trim().toLowerCase();
  if (normalized === 'appadmin' || normalized === 'admin') return 'AppAdmin';
  if (normalized === 'institutionadmin') return 'InstitutionAdmin';
  if (normalized === 'finance') return 'Finance';
  if (normalized === 'saad') return 'SAAD';
  if (normalized === 'student') return 'Student';
  return roleName;
};

export const getRoleName = (user?: User | null): string => {
  const role = user?.role;

  if (!role) return '';
  if (typeof role === 'string') return normalizeRoleName(role);

  return role.name ? normalizeRoleName(role.name) : '';
};

export const getInstitutionName = (user?: User | null): string => {
  const institution = user?.institution;

  if (!institution) return '';
  if (typeof institution === 'string') return institution;

  return institution.name || '';
};

export const getUserInitials = (name: string) =>
  name
    .split(/[.\s_-]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
