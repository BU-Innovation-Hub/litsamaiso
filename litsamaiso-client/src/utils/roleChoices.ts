import { ClipboardCheck, GraduationCap, type LucideIcon } from 'lucide-react';

export interface RoleChoice {
  label: string;
  description: string;
  icon: LucideIcon;
}

// How each role appears to someone choosing which dashboard to work in
const roleChoices: Record<string, RoleChoice> = {
  Student: {
    label: 'Student',
    description: 'Vote, confirm your account and follow your issues.',
    icon: GraduationCap,
  },
  IEC: {
    label: 'IEC',
    description: 'Run elections for the Independent Electoral Commission.',
    icon: ClipboardCheck,
  },
};

export const getRoleChoice = (role: string): RoleChoice =>
  roleChoices[role] ?? { label: role, description: '', icon: GraduationCap };
