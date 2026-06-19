import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileWarning,
  ListChecks,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getInstitutionName, getRoleName } from '../utils/userDisplay';
import { adminIssueService } from '../services/adminIssueService';
import { accountService, type AccountReports } from '../services/accountService';
import { electionService } from '../services/electionService';
import { institutionService } from '../services/institutionService';
import { issueService } from '../services/issueService';
import { userService } from '../services/userService';
import { canAccess, roleAccess, type RoleName } from '../utils/roleAccess';
import { isAdminDashboardRole } from '../navigation';
import type { Account, Election, Institution, User } from '../types';

interface AdminIssue {
  _id: string;
  status?: string;
  studentId?: string;
  contractNumber?: string;
  bankName?: string;
  createdAt?: string;
  student?: {
    name?: string;
    email?: string;
    studentId?: string;
  } | null;
  account?: {
    fullnames?: string;
    courseOfStudy?: string;
  } | null;
}

interface StudentIssue {
  _id: string;
  status?: string;
  studentId?: string;
  contractNumber?: string;
  bankName?: string;
  createdAt?: string;
}

type ConfirmationStatus = Awaited<ReturnType<typeof accountService.getConfirmationStatus>>;

interface KpiCard {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone: string;
}

const dashboardElectionRoles: RoleName[] = ['SAAD', 'Student'];

const formatStatus = (status?: string) =>
  status ? status.replace(/[_-]/g, ' ') : 'Not available';

const isPendingIssueStatus = (status?: string) => {
  const normalized = String(status || 'submitted').toLowerCase();
  return normalized === 'submitted' || normalized === 'reported';
};

const formatDate = (date?: string) => {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
    <p className="font-semibold text-primary-clr">{title}</p>
    <p className="mt-1 text-sm text-slate-500">{description}</p>
  </div>
);

const LoadingCard: React.FC = () => (
  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
    <div className="mt-4 h-8 w-16 animate-pulse rounded bg-slate-200" />
    <div className="mt-3 h-3 w-36 animate-pulse rounded bg-slate-100" />
  </div>
);

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const roleName = getRoleName(user);
  const institutionName = getInstitutionName(user);
  const isAdminShell = isAdminDashboardRole(roleName);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [elections, setElections] = useState<Election[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [accountReports, setAccountReports] = useState<AccountReports | null>(null);
  const [recentAccounts, setRecentAccounts] = useState<Account[]>([]);
  const [adminIssues, setAdminIssues] = useState<AdminIssue[]>([]);
  const [studentIssues, setStudentIssues] = useState<StudentIssue[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationStatus | null>(null);

  const canViewElections = canAccess(roleName, dashboardElectionRoles);
  const canViewReports = canAccess(roleName, roleAccess.accounts) && roleName !== 'Student';
  const canViewUsers = canAccess(roleName, roleAccess.users);
  const canViewInstitutions = canAccess(roleName, roleAccess.institutions);
  const canViewAdminIssues = roleName === 'Finance';
  const canViewStudentActions = roleName === 'Student';

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setIsLoading(true);
      setLoadError('');

      const errors: string[] = [];

      const load = async <T,>(enabled: boolean, request: () => Promise<T>, fallback: T) => {
        if (!enabled) return fallback;
        try {
          return await request();
        } catch {
          errors.push('Dashboard data');
          return fallback;
        }
      };

      const [
        nextElections,
        nextUsers,
        nextInstitutions,
        nextReports,
        nextAccounts,
        nextAdminIssues,
        nextStudentIssues,
        nextConfirmation,
      ] = await Promise.all([
        load(canViewElections, () => electionService.getElections(), [] as Election[]),
        load(canViewUsers, () => userService.getUsers({ limit: 100 }), [] as User[]),
        load(canViewInstitutions, () => institutionService.getInstitutions(), [] as Institution[]),
        load(canViewReports, () => accountService.getReports(), null as AccountReports | null),
        load(canViewReports, () => accountService.listAccounts({ limit: 6 }).then((res) => res.accounts), [] as Account[]),
        load(canViewAdminIssues, () => adminIssueService.listIssues() as Promise<AdminIssue[]>, [] as AdminIssue[]),
        load(canViewStudentActions, () => issueService.listIssues() as Promise<StudentIssue[]>, [] as StudentIssue[]),
        load(canViewStudentActions, () => accountService.getConfirmationStatus(), null as ConfirmationStatus | null),
      ]);

      if (!isMounted) return;

      setElections(nextElections);
      setUsers(nextUsers);
      setInstitutions(nextInstitutions);
      setAccountReports(nextReports);
      setRecentAccounts(nextAccounts);
      setAdminIssues(nextAdminIssues);
      setStudentIssues(nextStudentIssues);
      setConfirmation(nextConfirmation);
      setLoadError(errors.length > 0 ? 'Some dashboard data could not be loaded.' : '');
      setIsLoading(false);
    };

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [
    canViewAdminIssues,
    canViewElections,
    canViewInstitutions,
    canViewReports,
    canViewStudentActions,
    canViewUsers,
  ]);

  const accountSummary = accountReports?.reports.summary;
  const openElections = elections.filter((election) => election.status === 'OPEN').length;
  const scheduledElections = elections.filter((election) => election.status === 'SCHEDULED').length;
  const pendingIssues = adminIssues.filter((issue) => isPendingIssueStatus(issue.status)).length;
  const rejectedIssues = adminIssues.filter((issue) => issue.status === 'rejected').length;
  const activeInstitutions = institutions.filter((institution) => !institution.locked).length;

  const kpiCards = useMemo<KpiCard[]>(() => {
    if (roleName === 'Student') {
      return [
        {
          label: 'Confirmation',
          value: confirmation?.confirmed ? 'Confirmed' : 'Pending',
          description: confirmation?.message || 'Account confirmation status',
          icon: confirmation?.confirmed ? BadgeCheck : Clock3,
          tone: confirmation?.confirmed ? 'bg-gray-100 text-active-clr' : 'bg-gray-100 text-active-clr',
        },
        {
          label: 'Open elections',
          value: openElections,
          description: 'Available election workflows',
          icon: CalendarDays,
          tone: 'bg-gray-100 text-active-clr',
        },
        {
          label: 'Submitted issues',
          value: studentIssues.length,
          description: 'Corrections or account issues',
          icon: FileWarning,
          tone: 'bg-gray-100 text-active-clr',
        },
      ];
    }

    if (roleName === 'SAAD') {
      return [
        {
          label: 'Total elections',
          value: elections.length,
          description: 'Election records in scope',
          icon: CalendarDays,
          tone: 'bg-indigo-50 text-active-clr',
        },
        {
          label: 'Open elections',
          value: openElections,
          description: 'Currently accepting votes',
          icon: CheckCircle2,
          tone: 'bg-emerald-50 text-emerald-700',
        },
        {
          label: 'Scheduled elections',
          value: scheduledElections,
          description: 'Published for a future window',
          icon: Clock3,
          tone: 'bg-amber-50 text-amber-700',
        },
      ];
    }

    const cards: KpiCard[] = [];

    if (canViewReports) {
      cards.push(
        {
          label: 'Total accounts',
          value: accountSummary?.total ?? 0,
          description: 'Accounts available in report scope',
          icon: Banknote,
          tone: 'bg-indigo-50 text-active-clr',
        },
        {
          label: 'Confirmed accounts',
          value: accountSummary?.confirmed ?? 0,
          description: `${accountSummary?.confirmationRate ?? 0}% confirmation rate`,
          icon: BadgeCheck,
          tone: 'bg-emerald-50 text-emerald-700',
        },
        {
          label: 'Paid accounts',
          value: accountSummary?.paid ?? 0,
          description: `${accountSummary?.paymentRate ?? 0}% payment rate`,
          icon: Banknote,
          tone: 'bg-sky-50 text-sky-700',
        },
        {
          label: 'Pending confirmations',
          value: accountSummary?.unconfirmed ?? 0,
          description: 'Accounts still awaiting confirmation',
          icon: AlertCircle,
          tone: 'bg-amber-50 text-amber-700',
        },
      );
    }

    if (canViewAdminIssues) {
      cards.push(
        {
          label: 'Pending issues',
          value: pendingIssues,
          description: 'Student corrections awaiting finance review',
          icon: FileWarning,
          tone: 'bg-rose-50 text-rose-700',
        },
        {
          label: 'Rejected issues',
          value: rejectedIssues,
          description: 'Corrections rejected after review',
          icon: AlertCircle,
          tone: 'bg-slate-100 text-slate-700',
        },
      );
    }

    if (canViewUsers) {
      cards.push({
        label: 'Users',
        value: users.length,
        description: 'Users available to your role',
        icon: Users,
        tone: 'bg-violet-50 text-violet-700',
      });
    }

    if (canViewInstitutions) {
      cards.push(
        {
          label: 'Institutions',
          value: institutions.length,
          description: 'Institutions registered in Litsamaiso',
          icon: Building2,
          tone: 'bg-cyan-50 text-cyan-700',
        },
        {
          label: 'Active institutions',
          value: activeInstitutions,
          description: 'Institutions without an active lock',
          icon: ShieldCheck,
          tone: 'bg-emerald-50 text-emerald-700',
        },
      );
    }

    return cards;
  }, [
    accountSummary?.confirmationRate,
    accountSummary?.confirmed,
    accountSummary?.paid,
    accountSummary?.paymentRate,
    accountSummary?.total,
    accountSummary?.unconfirmed,
    activeInstitutions,
    canViewAdminIssues,
    canViewInstitutions,
    canViewReports,
    canViewUsers,
    confirmation?.confirmed,
    confirmation?.message,
    elections.length,
    institutions.length,
    openElections,
    pendingIssues,
    rejectedIssues,
    roleName,
    scheduledElections,
    studentIssues.length,
    users.length,
  ]);

  const recentRecords = canViewAdminIssues ? adminIssues : studentIssues.slice(0, 5);
  const hasStatusBreakdown = Boolean(accountReports?.reports.statusBreakdown?.length);
  const totalStatusCount = accountReports?.reports.statusBreakdown?.reduce((sum, item) => sum + item.count, 0) ?? 0;

  return (
    <div className={`${isAdminShell ? 'px-4 py-6 sm:px-6 lg:px-8' : 'px-4 pb-10 pt-28 sm:px-6 lg:px-8'} min-h-screen bg-slate-50`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-active-clr">{roleName || 'Dashboard'}</p>
            <h1 className="mt-2 text-3xl font-bold text-primary-clr sm:text-4xl">
              Welcome back, {user?.name || user?.email?.split('@')[0] || 'there'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {institutionName
                ? `${institutionName} workspace`
                : 'Your Litsamaiso workspace'} with role-aware activity, queues, and account status.
            </p>
          </div>
        </section>

        {loadError && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{loadError}</p>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => <LoadingCard key={index} />)
            : kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-500">{card.label}</p>
                        <p className="mt-3 text-3xl font-bold text-primary-clr">{card.value}</p>
                      </div>
                      <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${card.tone}`}>
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-slate-500">{card.description}</p>
                  </div>
                );
              })}
        </section>

        {!isLoading && kpiCards.length === 0 && (
          <EmptyState
            title="No dashboard metrics available"
            description="Your role does not currently have dashboard metrics exposed by the API."
          />
        )}

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-primary-clr">
                  {canViewReports ? 'Account status' : 'Workflow status'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {canViewReports ? 'Breakdown from account reports' : 'Current records available to this role'}
                </p>
              </div>
              <ListChecks className="h-5 w-5 text-active-clr" aria-hidden="true" />
            </div>

            <div className="mt-5">
              {canViewReports && hasStatusBreakdown ? (
                <div className="space-y-4">
                  {accountReports?.reports.statusBreakdown?.map((item) => {
                    const percent = totalStatusCount > 0 ? Math.round((item.count / totalStatusCount) * 100) : 0;
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-primary-clr">{formatStatus(item.label)}</span>
                          <span className="text-slate-500">{item.count}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-active-clr" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : canViewElections && elections.length > 0 ? (
                <div className={`divide-y divide-slate-100 ${canViewAdminIssues ? 'max-h-[28rem] overflow-y-auto pr-1' : ''}`}>
                  {elections.slice(0, 5).map((election) => (
                    <div key={election._id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="font-semibold text-primary-clr">{election.title}</p>
                        <p className="text-sm text-slate-500">{formatStatus(election.status)}</p>
                      </div>
                      <Link to={roleName === 'SAAD' ? '/elections/manage' : '/elections'} className="text-sm font-semibold text-active-clr">
                        Open
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No status data to show"
                  description="There are no API records available for this dashboard section yet."
                />
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-primary-clr">
                  {canViewAdminIssues ? 'Issue queue' : canViewStudentActions ? 'Your issues' : 'Recent records'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Latest records from available endpoints</p>
              </div>
              <FileWarning className="h-5 w-5 text-active-clr" aria-hidden="true" />
            </div>

            <div className="mt-5">
              {(canViewAdminIssues || canViewStudentActions) && recentRecords.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {recentRecords.map((issue) => {
                    const isPending = canViewAdminIssues && isPendingIssueStatus(issue.status);
                    const rowContent = (
                      <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-primary-clr">
                          {issue.contractNumber || issue.studentId || 'Issue record'}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {formatStatus(issue.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {[issue.bankName, formatDate(issue.createdAt)].filter(Boolean).join(' • ') || 'No additional details'}
                      </p>
                      </>
                    );

                    return (
                      <div key={issue._id} className="py-3">
                        {isPending ? (
                          <Link to="/accounts?tab=issues" className="block rounded-lg p-2 transition hover:bg-slate-50">
                            {rowContent}
                          </Link>
                        ) : (
                          rowContent
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : !canViewAdminIssues && canViewReports && recentAccounts.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {recentAccounts.map((account) => (
                    <div key={account._id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="font-semibold text-primary-clr">{account.fullnames}</p>
                        <p className="text-sm text-slate-500">{account.contractNumber}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {formatStatus(account.status)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent records"
                  description="This section will populate when matching records are returned by the API."
                />
              )}
            </div>
          </div>
        </section>

        {roleName === 'Student' && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary-clr">Student actions</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Continue from the account confirmation and issue workflows available to you.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/confirmation" className="rounded-lg bg-primary-clr px-4 py-2 text-sm font-semibold text-white">
                  Confirmation
                </Link>
                <Link to="/issues" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-primary-clr hover:bg-slate-50">
                  Issues
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
