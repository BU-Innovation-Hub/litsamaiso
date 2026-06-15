import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle, CreditCard, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getInstitutionName, getRoleName } from '../utils/userDisplay';
import { electionService } from '../services/electionService';
import { userService } from '../services/userService';
import { accountService, type AccountReports } from '../services/accountService';
import { canAccess, roleAccess, type RoleName } from '../utils/roleAccess';

const dashboardElectionRoles: RoleName[] = ['InstitutionAdmin', 'SAAD', 'Student'];

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const roleName = getRoleName(user);
  const institutionName = getInstitutionName(user);
  const [electionCount, setElectionCount] = useState(0);
  const [openElectionCount, setOpenElectionCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [accountReports, setAccountReports] = useState<AccountReports | null>(null);

  const canViewUsers = canAccess(roleName, roleAccess.users);
  const canViewReports = canAccess(roleName, roleAccess.accounts) && roleName !== 'Student';
  const canViewElections = canAccess(roleName, dashboardElectionRoles);

  useEffect(() => {
    const loadDashboard = async () => {
      if (canViewElections) {
        try {
          const elections = await electionService.getElections();
          setElectionCount(elections.length);
          setOpenElectionCount(elections.filter((election) => election.status === 'OPEN').length);
        } catch {
          setElectionCount(0);
          setOpenElectionCount(0);
        }
      }

      if (canViewUsers) {
        try {
          const users = await userService.getUsers({ limit: 100 });
          setUserCount(users.length);
        } catch {
          setUserCount(0);
        }
      }

      if (canViewReports) {
        try {
          setAccountReports(await accountService.getReports());
        } catch {
          setAccountReports(null);
        }
      }
    };

    void loadDashboard();
  }, [canViewElections, canViewReports, canViewUsers]);

  const summary = accountReports?.reports.summary;
  const dashboardCards = useMemo(
    () =>
      [
        {
          label: 'Total Elections',
          value: electionCount,
          icon: CalendarDays,
          iconClass: 'text-purple-600',
          valueClass: 'text-gray-900',
          show: canViewElections,
        },
        {
          label: 'Active Elections',
          value: openElectionCount,
          icon: CheckCircle,
          iconClass: 'text-green-600',
          valueClass: 'text-gray-900',
          show: canViewElections,
        },
        {
          label: 'Total Accounts',
          value: summary?.total ?? '--',
          icon: CreditCard,
          iconClass: 'text-blue-600',
          valueClass: 'text-gray-900',
          show: canViewReports,
        },
        {
          label: 'Confirmed Accounts',
          value: summary?.confirmed ?? '--',
          icon: CheckCircle,
          iconClass: 'text-green-600',
          valueClass: 'text-green-600',
          show: canViewReports,
        },
        {
          label: 'Paid Accounts',
          value: summary?.paid ?? '--',
          icon: CreditCard,
          iconClass: 'text-blue-600',
          valueClass: 'text-blue-600',
          show: canViewReports,
        },
        {
          label: 'Unconfirmed Accounts',
          value: summary?.unconfirmed ?? '--',
          icon: AlertCircle,
          iconClass: 'text-yellow-600',
          valueClass: 'text-yellow-600',
          show: canViewReports,
        },
        {
          label: 'Total Users',
          value: userCount,
          icon: Users,
          iconClass: 'text-slate-600',
          valueClass: 'text-gray-900',
          show: canViewUsers,
        },
      ].filter((card) => card.show),
    [
      canViewElections,
      canViewReports,
      canViewUsers,
      electionCount,
      openElectionCount,
      summary?.confirmed,
      summary?.paid,
      summary?.total,
      summary?.unconfirmed,
      userCount,
    ],
  );

  const gettingStartedItems = useMemo(
    () =>
      [
        canViewElections ? 'View election activity in your institution.' : null,
        canViewReports ? 'Review account uploads, confirmations, and payments.' : null,
        canViewUsers ? 'Manage users within your allowed scope.' : null,
        canAccess(roleName, roleAccess.accountConfirmation)
          ? 'Confirm your account details and submit corrections.'
          : null,
      ].filter((item): item is string => Boolean(item)),
    [canViewElections, canViewReports, canViewUsers, roleName],
  );

  return (
    <div className="min-h-screen bg-gray-50 pt-24 mt-5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-primary-clr mb-2">
            Welcome, {user?.email.split('@')[0]}!
          </h1>
          <p className="text-muted-foreground">
            Role: <span className="font-semibold">{roleName || 'User'}</span>
          </p>
          {roleName !== 'AppAdmin' && (
            <p className="text-muted-foreground">
              Institution: <span className="font-semibold">{institutionName || 'Not assigned'}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {dashboardCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Icon className={`w-8 h-8 ${card.iconClass}`} />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">{card.label}</p>
                    <p className={`text-2xl font-bold ${card.valueClass}`}>{card.value}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-primary-clr mb-2">Getting Started</h2>
          <p className="text-foreground mb-4">
            Welcome to Litsamaiso. This dashboard shows the tools available to your role.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {gettingStartedItems.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
