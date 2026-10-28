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

// Shown on the Student dashboard to someone on the IEC, who can't vote while a member
export const IEC_CANNOT_VOTE_MESSAGE =
  "You're on the IEC, so you can't vote while you're a member. Switch to IEC from the header to run elections.";
