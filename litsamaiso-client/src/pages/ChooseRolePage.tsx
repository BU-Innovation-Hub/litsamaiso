import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getRoleChoice } from '../utils/roleChoices';

// Shown after sign-in to someone who holds more than one role, such as a Student on the IEC
const ChooseRolePage: React.FC = () => {
  const { user, availableRoles, activeRole, switchRole } = useAuth();
  const navigate = useNavigate();

  if (availableRoles.length < 2) {
    return <Navigate to="/dashboard" replace />;
  }

  const choose = (role: string) => {
    switchRole(role);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg">
        <h1 className="mb-2 text-center text-2xl font-bold text-primary-clr">
          Welcome{user?.name ? `, ${user.name}` : ''}
        </h1>
        <p className="mb-8 text-center text-muted-foreground">
          Choose which dashboard to open. You can switch at any time from the header.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {availableRoles.map((role) => {
            const { label, description, icon: Icon } = getRoleChoice(role);
            return (
              <button
                key={role}
                type="button"
                onClick={() => choose(role)}
                className={`flex flex-col items-start gap-3 rounded-2xl border bg-white p-6 text-left shadow-sm transition hover:border-active-clr hover:shadow-md ${
                  role === activeRole ? 'border-active-clr' : 'border-slate-200'
                }`}
              >
                <Icon className="h-8 w-8 text-active-clr" aria-hidden="true" />
                <span className="text-lg font-semibold text-primary-clr">{label}</span>
                <span className="text-sm text-muted-foreground">{description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ChooseRolePage;
