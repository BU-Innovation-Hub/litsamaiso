import type { Side } from 'driver.js';

/** Bump when the tour changes enough that everyone should be offered it again. */
export const TOUR_VERSION = 1;

export interface TourStep {
  /** `[data-tour="…"]` anchor; omitted (or not visible) renders a centred popover. */
  element?: string;
  title: string;
  description: string;
  side?: Side;
}

/** Steps shown on one page. The tour navigates to `route` before showing them. */
export interface TourChapter {
  route: string;
  steps: TourStep[];
}

const anchor = (id: string) => `[data-tour="${id}"]`;

export const institutionAdminTour: TourChapter[] = [
  {
    route: '/dashboard',
    steps: [
      {
        title: 'Welcome to your workspace',
        description:
          'This two-minute tour shows you the essentials of running your institution on Litsamaiso. You can skip it at any time and replay it later.',
      },
      {
        element: anchor('sidebar-nav'),
        title: 'Your navigation',
        description:
          'Everything you can do as Institution Admin lives here: your team, student accounts, branding and billing.',
        side: 'right',
      },
      {
        element: anchor('account-panel'),
        title: 'Your account',
        description: 'Open your profile, sign out, or replay this tour whenever you need a refresher.',
        side: 'right',
      },
    ],
  },
  {
    route: '/users',
    steps: [
      {
        element: anchor('users-header'),
        title: 'Build your team',
        description:
          'Give each colleague the role they need: <b>Finance</b> for sponsorship and payments, <b>Registry</b> for the student roll, and <b>SAAD</b> for elections.',
        side: 'bottom',
      },
      {
        element: anchor('users-create'),
        title: 'Add a staff member',
        description: 'Create an account and pick the role. They sign in with the email and password you set here.',
        side: 'left',
      },
    ],
  },
  {
    route: '/accounts',
    steps: [
      {
        element: anchor('accounts-header'),
        title: 'Accounts & reports',
        description:
          'Track student account confirmations, review reported issues, and export institution-wide reports.',
        side: 'bottom',
      },
      {
        element: anchor('accounts-import-students'),
        title: 'Import your students',
        description:
          'Upload your student list as Excel or CSV. Students can only register once they are on this list, and your plan’s student limit applies here.',
        side: 'left',
      },
    ],
  },
  {
    route: '/settings/branding',
    steps: [
      {
        element: anchor('branding-logo'),
        title: 'Add your logo',
        description: 'Your logo appears in the sidebar for everyone at your institution.',
        side: 'bottom',
      },
      {
        element: anchor('branding-theme'),
        title: 'Fine-tune your colours',
        description:
          'Switch themes any time. Colours are checked for readability and balanced with the 60-30-10 rule, so your workspace always looks sharp.',
        side: 'right',
      },
    ],
  },
  {
    route: '/settings/billing',
    steps: [
      {
        element: anchor('billing-plan'),
        title: 'Your subscription',
        description:
          'See your plan and renewal date. <b>Manage billing & plan</b> opens a secure portal for invoices, your card, plan changes and cancellation.',
        side: 'bottom',
      },
      {
        element: anchor('billing-usage'),
        title: 'Student usage',
        description: 'Keep an eye on how many students you have against your plan’s limit.',
        side: 'top',
      },
    ],
  },
  {
    route: '/dashboard',
    steps: [
      {
        title: 'You’re ready to go',
        description:
          'Suggested next steps:<br/>1. Invite your Finance and Registry colleagues<br/>2. Import your students<br/>3. Share the student sign-up link<br/><br/>Replay this tour any time from <b>Take the tour</b> in the sidebar.',
      },
    ],
  },
];

/** The tour for a role, or null when that role has none yet. */
export const getTourForRole = (roleName: string): TourChapter[] | null =>
  roleName === 'InstitutionAdmin' ? institutionAdminTour : null;
