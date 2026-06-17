import type { Role } from '../types';

export type RoleName = Role['name'];

export const roleAccess = {
  dashboard: ['AppAdmin', 'InstitutionAdmin', 'Finance', 'SAAD', 'Student'],
  accounts: ['AppAdmin', 'InstitutionAdmin', 'Finance'],
  accountConfirmation: ['Student'],
  elections: ['Student'],
  electionManagement: ['SAAD'],
  users: ['AppAdmin', 'InstitutionAdmin'],
  institutions: ['AppAdmin'],
} satisfies Record<string, RoleName[]>;

export const canAccess = (roleName: string, allowedRoles: readonly RoleName[]) =>
  allowedRoles.includes(roleName as RoleName);
