import { createContext } from 'react';
import type { RegisterRequest, User } from '../types';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  // The role the signed-in user is working as; differs from their own role only for
  // someone holding several, such as a Student on the IEC
  activeRole: string;
  availableRoles: string[];
  // Holds several roles and hasn't picked one yet
  needsRoleChoice: boolean;
  // On the IEC, and so not allowed to vote
  isIecMember: boolean;
  // A student who can vote but has no profile photo to check their face against yet
  needsVotingPhoto: boolean;
  switchRole: (role: string) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
