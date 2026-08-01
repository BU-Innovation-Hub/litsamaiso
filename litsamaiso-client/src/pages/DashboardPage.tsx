import React, { useEffect, useMemo, useState } from 'react';
import posthog from 'posthog-js';
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileWarning,
  ListChecks,
  Sparkles,
  TrendingUp,
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
  borrowerNumber?: string;
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
  borrowerNumber?: string;
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
  accent: string;
  progress?: number;
}

interface ActionItem {
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  primary?: boolean;
}

interface InsightItem {
  label: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
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

const clampPercent = (value?: number) => Math.max(0, Math.min(100, Math.round(value ?? 0)));

const EmptyState: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75 p-8 text-center shadow-sm backdrop-blur">
    <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
      <Sparkles className="h-5 w-5" aria-hidden="true" />
    </div>
    <p className="font-semibold text-primary-clr">{title}</p>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
  </div>
);

const LoadingCard: React.FC = () => (
  <div className="rounded-3xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur">
    <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
    <div className="mt-4 h-8 w-16 animate-pulse rounded bg-slate-200" />
    <div className="mt-3 h-3 w-36 animate-pulse rounded bg-slate-100" />
    <div className="mt-6 h-2 w-full animate-pulse rounded-full bg-slate-100" />
  </div>
);

const MetricCard: React.FC<{ card: KpiCard }> = ({ card }) => {
  const Icon = card.icon;

  return (
    <article className="group relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${card.accent}`} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{card.label}</p>
          <p className="mt-3 truncate text-3xl font-bold text-primary-clr">{card.value}</p>
        </div>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${card.tone}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 min-h-10 text-sm leading-5 text-slate-500">{card.description}</p>
      {typeof card.progress === 'number' && (
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full bg-linear-to-r ${card.accent}`}
              style={{ width: `${clampPercent(card.progress)}%` }}
            />
          </div>
        </div>
      )}
    </article>
  );
};

const ActionCard: React.FC<{ action: ActionItem }> = ({ action }) => {
  const Icon = action.icon;

  return (
    <Link
      to={action.to}
      className={`group flex items-center justify-between gap-4 rounded-2xl border p-4 transition duration-300 ${
        action.primary
          ? 'border-primary-clr bg-primary-clr text-white shadow-lg shadow-slate-900/10 hover:-translate-y-0.5'
          : 'border-slate-200 bg-white/80 text-primary-clr hover:-translate-y-0.5 hover:bg-white hover:shadow-md'
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
            action.primary ? 'bg-white/15 text-white' : 'bg-slate-100 text-active-clr'
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold">{action.label}</span>
          <span className={`mt-1 block text-xs leading-5 ${action.primary ? 'text-white/72' : 'text-slate-500'}`}>
            {action.description}
          </span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-1" aria-hidden="true" />
    </Link>
  );
};

const InsightCard: React.FC<{ insight: InsightItem }> = ({ insight }) => {
  const Icon = insight.icon;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/75 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-active-clr">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-xl font-bold text-primary-clr">{insight.value}</span>
      </div>
      <p className="mt-4 text-sm font-semibold text-primary-clr">{insight.label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{insight.description}</p>
    </div>
  );
};

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const roleName = getRoleName(user);
  const institutionName = getInstitutionName(user);
  const isAdminShell = isAdminDashboardRole(roleName);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [elections, setElections] = useState<Election[]>([]);
  const [userTotal, setUserTotal] = useState(0);
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
      const startedAt = Date.now();
      const isStudentDashboard = roleName === 'Student';

      if (isStudentDashboard) {
        posthog.capture('student_dashboard_load_started', {
          userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        });
      }

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
        nextUserPage,
        nextInstitutions,
        nextReports,
        nextAccounts,
        nextAdminIssues,
        nextStudentIssues,
        nextConfirmation,
      ] = await Promise.all([
        load(canViewElections, () => electionService.getElections({ limit: 10 }), [] as Election[]),
        load(
          canViewUsers,
          () => userService.getUsers({ limit: 100 }),
          { users: [] as User[], total: 0 } as { users: User[]; total: number },
        ),
        load(canViewInstitutions, () => institutionService.getInstitutions(), [] as Institution[]),
        load(canViewReports, () => accountService.getReports(), null as AccountReports | null),
        load(canViewReports, () => accountService.listAccounts({ limit: 6 }).then((res) => res.accounts), [] as Account[]),
        load(canViewAdminIssues, () => adminIssueService.listIssues() as Promise<AdminIssue[]>, [] as AdminIssue[]),
        load(canViewStudentActions, () => issueService.listIssues({ limit: 5 }) as Promise<StudentIssue[]>, [] as StudentIssue[]),
        load(canViewStudentActions, () => accountService.getConfirmationStatus(), null as ConfirmationStatus | null),
      ]);

      if (!isMounted) return;

      setElections(nextElections);
      setUserTotal(nextUserPage.total);
      setInstitutions(nextInstitutions);
      setAccountReports(nextReports);
      setRecentAccounts(nextAccounts);
      setAdminIssues(nextAdminIssues);
      setStudentIssues(nextStudentIssues);
      setConfirmation(nextConfirmation);
      setLoadError(errors.length > 0 ? 'Some dashboard data could not be loaded.' : '');
      setIsLoading(false);

      if (isStudentDashboard) {
        posthog.capture('student_dashboard_load_finished', {
          durationMs: Date.now() - startedAt,
          errors: errors.length,
          elections: nextElections.length,
          studentIssues: nextStudentIssues.length,
          confirmationLoaded: Boolean(nextConfirmation),
        });
      }
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
    roleName,
  ]);

  const accountSummary = accountReports?.reports.summary;
  const confirmedNotPaidCount = Math.max(0, (accountSummary?.confirmed ?? 0) - (accountSummary?.paid ?? 0));
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
          accent: confirmation?.confirmed ? 'from-emerald-500 to-active-clr' : 'from-amber-400 to-active-clr',
          progress: confirmation?.confirmed ? 100 : 45,
        },
        {
          label: 'Open elections',
          value: openElections,
          description: 'Available election workflows',
          icon: CalendarDays,
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-active-clr to-sky-500',
        },
        {
          label: 'Submitted issues',
          value: studentIssues.length,
          description: 'Corrections or account issues',
          icon: FileWarning,
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-slate-700 to-active-clr',
        },
      ];
    }

    if (roleName === 'SAAD') {
      return [
        {
          label: 'Total elections',
          value: elections.length,
          description: 'Elections you can manage',
          icon: CalendarDays,
          tone: 'bg-indigo-50 text-active-clr',
          accent: 'from-active-clr to-sky-500',
        },
        {
          label: 'Open elections',
          value: openElections,
          description: 'Currently accepting votes',
          icon: CheckCircle2,
          tone: 'bg-emerald-50 text-emerald-700',
          accent: 'from-emerald-500 to-active-clr',
        },
        {
          label: 'Scheduled elections',
          value: scheduledElections,
          description: 'Published for a future window',
          icon: Clock3,
          tone: 'bg-amber-50 text-amber-700',
          accent: 'from-amber-400 to-active-clr',
        },
      ];
    }

    const cards: KpiCard[] = [];

    if (canViewReports) {
      cards.push(
        {
          label: 'Total accounts',
          value: accountSummary?.total ?? 0,
          description: 'Accounts in your workspace',
          icon: Banknote,
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-active-clr to-sky-500',
        },
        {
          label: 'Confirmed accounts',
          value: confirmedNotPaidCount,
          description: 'Confirmed but not yet paid',
          icon: BadgeCheck,
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-emerald-500 to-active-clr',
          progress: clampPercent((accountSummary?.confirmationRate ?? 0) * 100),
        },
        {
          label: 'Paid accounts',
          value: accountSummary?.paid ?? 0,
          description: `${((accountSummary?.paymentRate ?? 0) * 100).toFixed(2)}% payment rate`,
          icon: Banknote,
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-sky-500 to-active-clr',
          progress: clampPercent((accountSummary?.paymentRate ?? 0) * 100),
        },
        {
          label: 'Pending confirmations',
          value: accountSummary?.unconfirmed ?? 0,
          description: 'Accounts still awaiting confirmation',
          icon: AlertCircle,
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-amber-400 to-active-clr',
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
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-amber-400 to-active-clr',
        },
        {
          label: 'Rejected issues',
          value: rejectedIssues,
          description: 'Corrections rejected after review',
          icon: AlertCircle,
          tone: 'bg-slate-100 text-slate-700',
          accent: 'from-slate-500 to-slate-800',
        },
      );
    }

    if (canViewUsers) {
      cards.push({
        label: 'Users',
        value: userTotal,
        description: 'People you can manage',
        icon: Users,
        tone: 'bg-gray-100 text-active-clr',
        accent: 'from-active-clr to-sky-500',
      });
    }

    if (canViewInstitutions) {
      cards.push(
        {
          label: 'Institutions',
          value: institutions.length,
          description: 'Institutions registered in Litsamaiso',
          icon: Building2,
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-active-clr to-sky-500',
        },
        {
          label: 'Active institutions',
          value: activeInstitutions,
          description: 'Institutions without an active lock',
          icon: ShieldCheck,
          tone: 'bg-gray-100 text-active-clr',
          accent: 'from-emerald-500 to-active-clr',
          progress: institutions.length > 0 ? clampPercent((activeInstitutions / institutions.length) * 100) : 0,
        },
      );
    }

    return cards;
  }, [
    accountSummary?.confirmationRate,
    accountSummary?.paid,
    accountSummary?.paymentRate,
    accountSummary?.total,
    accountSummary?.unconfirmed,
    confirmedNotPaidCount,
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
    userTotal,
  ]);

  const recentRecords = canViewAdminIssues ? adminIssues : studentIssues.slice(0, 5);
  const hasStatusBreakdown = Boolean(accountReports?.reports.statusBreakdown?.length);
  const totalStatusCount = accountReports?.reports.statusBreakdown?.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const confirmationRate = clampPercent((accountSummary?.confirmationRate ?? 0) * 100);
  const paymentRate = clampPercent((accountSummary?.paymentRate ?? 0) * 100);
  const workspaceName = institutionName || 'Litsamaiso';
  const displayName = user?.name || user?.email?.split('@')[0] || 'there';

  const quickActions = useMemo<ActionItem[]>(() => {
    if (roleName === 'Student') {
      return [
        {
          label: 'Confirm account',
          description: 'Review and submit your banking details',
          to: '/accounts/confirm',
          icon: ShieldCheck,
          primary: true,
        },
        {
          label: 'Track issues',
          description: 'Follow submitted corrections',
          to: '/issues',
          icon: FileWarning,
        },
        ...(canViewElections
          ? [
              {
                label: 'Open elections',
                description: 'View voting activity available to you',
                to: '/elections',
                icon: CalendarDays,
              },
            ]
          : []),
      ];
    }

    if (roleName === 'SAAD') {
      return [
        {
          label: 'Manage elections',
          description: 'Create, schedule, and monitor voting',
          to: '/elections/manage',
          icon: CalendarDays,
          primary: true,
        },
        {
          label: 'View elections',
          description: 'Check live and upcoming election windows',
          to: '/elections',
          icon: CheckCircle2,
        },
      ];
    }

    const actions: ActionItem[] = [];

    if (canViewAdminIssues) {
      actions.push({
        label: 'Review issues',
        description: 'Resolve student payment corrections',
        to: '/accounts?tab=issues',
        icon: FileWarning,
        primary: true,
      });
    }

    if (canViewReports) {
      actions.push({
        label: 'Account workspace',
        description: 'Search, upload, and manage account details',
        to: '/accounts',
        icon: Banknote,
        primary: actions.length === 0,
      });
    }

    if (canViewUsers) {
      actions.push({
        label: 'Manage users',
        description: 'Review access and user roles',
        to: '/users',
        icon: Users,
      });
    }

    if (canViewInstitutions) {
      actions.push({
        label: 'Institutions',
        description: 'Manage registered institutions',
        to: '/institutions',
        icon: Building2,
      });
    }

    return actions.slice(0, 4);
  }, [canViewAdminIssues, canViewElections, canViewInstitutions, canViewReports, canViewUsers, roleName]);

  const insights = useMemo<InsightItem[]>(() => {
    if (roleName === 'Student') {
      return [
        {
          label: 'Account confirmation',
          value: confirmation?.confirmed ? 'Done' : 'Pending',
          description: confirmation?.message || 'Your confirmation status will appear here.',
          icon: confirmation?.confirmed ? BadgeCheck : Clock3,
        },
        {
          label: 'Election windows',
          value: openElections,
          description: 'Open elections currently available to you.',
          icon: CalendarDays,
        },
        {
          label: 'Issue updates',
          value: studentIssues.length,
          description: 'Corrections and account issues you have submitted.',
          icon: FileWarning,
        },
      ];
    }

    if (canViewReports) {
      return [
        {
          label: 'Confirmation health',
          value: `${confirmationRate}%`,
          description: 'Share of accounts confirmed by students.',
          icon: BadgeCheck,
        },
        {
          label: 'Payment progress',
          value: `${paymentRate}%`,
          description: 'Share of accounts marked as paid.',
          icon: TrendingUp,
        },
        {
          label: 'Needs attention',
          value: accountSummary?.unconfirmed ?? pendingIssues,
          description: canViewAdminIssues ? 'Items waiting for finance review or confirmation.' : 'Accounts still waiting for confirmation.',
          icon: AlertCircle,
        },
      ];
    }

    return [
      {
        label: 'Open elections',
        value: openElections,
        description: 'Election windows currently accepting votes.',
        icon: CheckCircle2,
      },
      {
        label: 'Scheduled elections',
        value: scheduledElections,
        description: 'Election windows prepared for later.',
        icon: Clock3,
      },
      {
        label: 'Active institutions',
        value: activeInstitutions,
        description: 'Institution workspaces currently available.',
        icon: Building2,
      },
    ];
  }, [
    accountSummary?.unconfirmed,
    activeInstitutions,
    canViewAdminIssues,
    canViewReports,
    confirmation?.confirmed,
    confirmation?.message,
    confirmationRate,
    openElections,
    paymentRate,
    pendingIssues,
    roleName,
    scheduledElections,
    studentIssues.length,
  ]);

  return (
    <div
      className={`global-bg relative min-h-screen ${
        isAdminShell ? 'px-4 py-6 sm:px-6 lg:px-8' : 'px-4 pb-10 pt-28 sm:px-6 lg:px-8'
      }`}
    >
      <div className="absolute inset-0 bg-white/86 sm:bg-white/78" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(83,91,192,0.08),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(14,165,233,0.07),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.5)_0%,rgba(248,250,252,0.92)_55%,rgba(255,255,255,0.82)_100%)] sm:bg-[radial-gradient(circle_at_12%_10%,rgba(83,91,192,0.12),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(14,165,233,0.1),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.45)_0%,rgba(248,250,252,0.9)_55%,rgba(255,255,255,0.8)_100%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-4xl border border-white/70 bg-white/88 shadow-xl shadow-slate-900/5 backdrop-blur mt-5">
          <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase text-active-clr shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-active-clr" />
                  {roleName || 'Dashboard'}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {workspaceName} workspace
                </span>
              </div>

              <h1 className="mt-6 max-w-3xl text-3xl font-bold leading-tight text-primary-clr sm:text-4xl lg:text-5xl">
                Welcome back, {displayName}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                A focused command center for today&apos;s student operations, account movement, issues, and election activity.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {insights.map((insight) => (
                  <InsightCard key={insight.label} insight={insight} />
                ))}
              </div>
            </div>

            <aside className="border-t border-slate-200/70 bg-primary-clr p-6 text-white sm:p-8 lg:border-l lg:border-t-0">
              <div className="flex h-full flex-col justify-between gap-8">
                <div>
                  <p className="text-sm font-semibold uppercase text-white/60">Next best moves</p>
                  <h2 className="mt-3 text-2xl font-bold">Keep the workflow moving.</h2>
                  <p className="mt-3 text-sm leading-6 text-white/68">
                    Jump into the tasks most relevant to your role without searching through menus.
                  </p>
                </div>

                <div className="space-y-3">
                  {quickActions.length > 0 ? (
                    quickActions.map((action) => <ActionCard key={action.label} action={action} />)
                  ) : (
                    <p className="rounded-2xl border border-white/10 bg-white/10 p-4 text-sm text-white/72">
                      More actions will appear as your workspace grows.
                    </p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>

        {loadError && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-800 shadow-sm backdrop-blur">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{loadError}</p>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => <LoadingCard key={index} />)
            : kpiCards.map((card) => <MetricCard key={card.label} card={card} />)}
        </section>

        {!isLoading && kpiCards.length === 0 && (
          <EmptyState
            title="No dashboard insights available"
            description="There are no dashboard insights available for your role yet."
          />
        )}

        {roleName !== 'Student' && (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.12fr_0.88fr]">
            <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur sm:p-6">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-active-clr">Operational flow</p>
                <h2 className="mt-2 text-xl font-bold text-primary-clr">
                  {canViewReports ? 'Account status' : 'Workflow status'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {canViewReports ? 'How student account work is progressing right now.' : 'Current activity available to your role.'}
                </p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-active-clr">
                <ListChecks className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>

            <div className="mt-6">
              {canViewReports && hasStatusBreakdown ? (
                <div className="space-y-5">
                  {accountReports?.reports.statusBreakdown?.map((item) => {
                    const percent = totalStatusCount > 0 ? Math.round((item.count / totalStatusCount) * 100) : 0;
                    return (
                      <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-primary-clr">{formatStatus(item.label)}</span>
                          <span className="font-semibold text-slate-500">{item.count}</span>
                        </div>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-linear-to-r from-active-clr to-sky-500" style={{ width: `${percent}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{percent}% of the current account list</p>
                      </div>
                    );
                  })}
                </div>
              ) : canViewElections && elections.length > 0 ? (
                <div className="space-y-3">
                  {elections.slice(0, 5).map((election) => (
                    <div key={election._id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-primary-clr">{election.title}</p>
                        <p className="text-sm text-slate-500">{formatStatus(election.status)}</p>
                      </div>
                      <Link
                        to={roleName === 'SAAD' ? '/elections/manage' : '/elections'}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-sm font-semibold text-active-clr shadow-sm transition hover:bg-slate-100"
                      >
                        Open
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No status data to show"
                  description="There is no activity to show in this section yet."
                />
              )}
            </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur sm:p-6">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-active-clr">Live work</p>
                <h2 className="mt-2 text-xl font-bold text-primary-clr">
                  {canViewAdminIssues ? 'Issue queue' : canViewStudentActions ? 'Your issues' : 'Recent activity'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Latest updates available to you.</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-active-clr">
                <FileWarning className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>

            <div className="mt-6">
              {(canViewAdminIssues || canViewStudentActions) && recentRecords.length > 0 ? (
                <div className="space-y-3">
                  {recentRecords.map((issue) => {
                    const isPending = canViewAdminIssues && isPendingIssueStatus(issue.status);
                    const rowContent = (
                      <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-primary-clr">
                          {issue.borrowerNumber || issue.studentId || 'Student issue'}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {formatStatus(issue.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {[issue.bankName, formatDate(issue.createdAt)].filter(Boolean).join(' - ') || 'No additional details'}
                      </p>
                      </>
                    );

                    return (
                      <div key={issue._id} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        {isPending ? (
                          <Link to="/accounts?tab=issues" className="block rounded-xl p-2 transition hover:bg-white">
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
                <div className="space-y-3">
                  {recentAccounts.map((account) => (
                    <div key={account._id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-primary-clr">{account.fullnames}</p>
                        <p className="text-sm text-slate-500">{account.borrowerNumber}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                        {formatStatus(account.status)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent activity"
                  description="This section will update when there is recent activity to show."
                />
              )}
            </div>
            </div>
          </section>
        )}

        {roleName === 'Student' && (
          <section className="rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur sm:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-active-clr">Student actions</p>
                <h2 className="mt-2 text-xl font-bold text-primary-clr">Stay in control of your account journey.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Continue with confirmation, follow corrections, or check election activity from one place.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/confirmation" className="inline-flex items-center gap-2 rounded-full bg-primary-clr px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5">
                  Confirmation
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link to="/issues" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-primary-clr shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50">
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
