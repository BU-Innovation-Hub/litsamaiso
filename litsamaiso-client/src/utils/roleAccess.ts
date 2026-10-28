import type { Role } from '../types';

export type RoleName = Role['name'];

export const roleAccess = {
  dashboard: ['AppAdmin', 'InstitutionAdmin', 'Finance', 'SAAD', 'IEC', 'Student', 'Registry'],
  registry: ['Registry'],
  accounts: ['AppAdmin', 'InstitutionAdmin', 'Finance'],
  accountConfirmation: ['Student'],
  elections: ['Student'],
  // The IEC (students appointed to run elections) does everything SAAD does here
  electionManagement: ['SAAD', 'IEC'],
  users: ['AppAdmin', 'InstitutionAdmin'],
  institutions: ['AppAdmin'],
  branchCodes: ['AppAdmin', 'Finance'],
} satisfies Record<string, RoleName[]>;

export const canAccess = (roleName: string, allowedRoles: readonly RoleName[]) =>
  allowedRoles.includes(roleName as RoleName);
