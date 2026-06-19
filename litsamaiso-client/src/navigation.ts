import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarDays,
  ClipboardCheck,
  History,
  LayoutDashboard,
  MessageSquareWarning,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { canAccess, roleAccess, type RoleName } from './utils/roleAccess';

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  roles: readonly RoleName[];
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    roles: roleAccess.dashboard,
    icon: LayoutDashboard,
  },
  {
    id: 'election-management',
    label: 'Elections Management',
    href: '/elections/manage',
    roles: roleAccess.electionManagement,
    icon: ClipboardCheck,
  },
  {
    id: 'accounts',
    label: 'Accounts',
    href: '/accounts',
    roles: roleAccess.accounts,
    icon: Banknote,
  },
  {
    id: 'student-issues',
    label: 'Issues',
    href: '/issues',
    roles: ['Student'],
    icon: MessageSquareWarning,
  },
  {
    id: 'confirmation',
    label: 'Confirmation',
    href: '/confirmation',
    roles: roleAccess.accountConfirmation,
    icon: BadgeCheck,
  },
  {
    id: 'elections',
    label: 'Elections',
    href: '/elections',
    roles: roleAccess.elections,
    icon: CalendarDays,
  },
  {
    id: 'users',
    label: 'Users',
    href: '/users',
    roles: roleAccess.users,
    icon: Users,
  },
  {
    id: 'institutions',
    label: 'Institutions',
    href: '/institutions',
    roles: roleAccess.institutions,
    icon: Building2,
  },
  {
    id: 'audit-logs',
    label: 'Audit Logs',
    href: '/audit-logs',
    roles: ['AppAdmin'],
    icon: History,
  },
];

export const adminDashboardRoles: RoleName[] = ['AppAdmin', 'InstitutionAdmin', 'Finance'];

export const getVisibleNavItems = (roleName: string) =>
  navigationItems.filter((item) => canAccess(roleName, item.roles));

export const isAdminDashboardRole = (roleName: string) =>
  canAccess(roleName, adminDashboardRoles);

export const isNavItemActive = (pathname: string, href: string) =>
  pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
