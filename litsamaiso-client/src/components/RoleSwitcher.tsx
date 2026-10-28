import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getRoleChoice } from '../utils/roleChoices';

// Lets someone who holds several roles (a Student on the IEC) change which one they work as
export const RoleSwitcher: React.FC<{ onSwitch?: () => void }> = ({ onSwitch }) => {
  const { availableRoles, activeRole, switchRole } = useAuth();
  const navigate = useNavigate();

  if (availableRoles.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Viewing as</span>
      <select
        value={activeRole}
        onChange={(event) => {
          switchRole(event.target.value);
          onSwitch?.();
          // Each role has its own dashboard and pages, so start again from the dashboard
          navigate('/dashboard');
        }}
        className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-primary-clr"
        aria-label="Switch dashboard"
      >
        {availableRoles.map((role) => (
          <option key={role} value={role}>
            {getRoleChoice(role).label}
          </option>
        ))}
      </select>
    </label>
  );
};
