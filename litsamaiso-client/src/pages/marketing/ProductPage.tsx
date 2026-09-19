import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  CreditCard,
  FileSpreadsheet,
  History,
  Landmark,
  MessageSquareText,
  Palette,
  ShieldCheck,
  UserCog,
  Vote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExplainerVideo } from '@/components/ExplainerVideo';
import { MarketingLayout, SectionHeading, SectionLabel } from '@/components/marketing/MarketingChrome';

const modules = [
  {
    icon: ClipboardCheck,
    title: 'Account confirmations & clearance',
    description:
      'Students confirm their bank details and sponsorship accounts online. Finance reviews, flags exceptions, and exports clean payment-ready lists.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Student registry',
    description:
      'Import your student roll from Excel or CSV. Registry keeps records current so only verified students can sign up and transact.',
  },
  {
    icon: MessageSquareText,
    title: 'Issues & resolution',
    description:
      'Students raise issues against their records, and staff respond and resolve them with a full, visible history.',
  },
  {
    icon: Vote,
    title: 'Student elections',
    description:
      'Run SRC and society elections with candidate management, one-student-one-vote integrity and instant results.',
  },
  {
    icon: BarChart3,
    title: 'Reports & exports',
    description:
      'Institution-wide reporting on confirmations, outstanding accounts and turnaround — exportable in a click.',
  },
  {
    icon: History,
    title: 'Audit trail',
    description:
      'Every sensitive action is recorded, so you can answer "who changed what, and when" with confidence.',
  },
];

const roles = [
  {
    id: 'institution-admin',
    label: 'Institution Admin',
    icon: UserCog,
    summary: 'Owns the workspace for your institution.',
    points: [
      'Invites Finance, Registry and SAAD staff',
      'Imports students and oversees accounts',
      'Sets your workspace colours and logo',
      'Manages the subscription and invoices',
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: Landmark,
    summary: 'Keeps student funding accurate.',
    points: [
      'Uploads sponsor and payment lists',
      'Reviews confirmations and resolves account issues',
      'Assigns branch codes and exports payment files',
    ],
  },
  {
    id: 'registry',
    label: 'Registry',
    icon: FileSpreadsheet,
    summary: 'Maintains the source of truth for students.',
    points: ['Imports and updates the student roll', 'Controls who is eligible to register'],
  },
  {
    id: 'saad',
    label: 'SAAD',
    icon: Vote,
    summary: 'Runs student affairs and governance.',
    points: ['Creates elections, positions and candidates', 'Publishes results transparently'],
  },
  {
    id: 'student',
    label: 'Students',
    icon: CreditCard,
    summary: 'Self-serve, from any phone.',
    points: [
      'Register with their student number',
      'Confirm bank details and upload documents',
      'Raise issues and vote in elections',
    ],
  },
];

const onboardingSteps = [
  { title: 'Choose a plan', description: 'Pick the plan that matches your student numbers.' },
  { title: 'Tell us about your institution', description: 'Your institution details and the admin account.' },
  { title: 'Make it yours', description: 'Choose colours and add your logo — with guardrails that keep it looking sharp.' },
  { title: 'Pay securely & go live', description: 'Card payment through Stripe, then a guided tour of your new workspace.' },
];

const trustPoints = [
  { icon: ShieldCheck, title: 'Role-based access', description: 'Each team sees only what their role needs, scoped to your institution.' },
  { icon: History, title: 'Full audit trail', description: 'Sensitive actions are logged with who, what and when.' },
  { icon: ClipboardCheck, title: 'Recorded consent', description: 'Students explicitly consent before sharing financial information.' },
  { icon: Palette, title: 'Your brand', description: 'A workspace in your colours, so staff and students know it is yours.' },
];

const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };

const ProductPage = () => {
  const [activeRole, setActiveRole] = useState(roles[0].id);
  const role = roles.find((item) => item.id === activeRole) ?? roles[0];
  const RoleIcon = role.icon;

  return (
    <MarketingLayout>
      <section className="px-5 pb-12 pt-10 md:px-8 md:pt-16">
        <SectionHeading
          as="h1"
          eyebrow="The platform"
          title="One trusted system for student support operations"
          description="Litsamaiso brings funding confirmations, the student registry, issues, elections and reporting into a single workspace for your institution — with the right access for every team."
        />
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/pricing"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary-clr px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-clr/90"
          >
            See pricing
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#modules"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-7 py-3 text-sm font-semibold text-primary-clr shadow-sm transition hover:bg-gray-50"
          >
            Explore modules
          </a>
        </div>
      </section>

      <section>
        <ExplainerVideo />
      </section>

      <section id="modules" className="px-5 py-24 md:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="What's included"
            title="Every module, on every plan"
            description="No add-ons to negotiate. Your institution gets the whole platform from day one."
          />
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module, index) => {
              const Icon = module.icon;
              return (
                <motion.article
                  key={module.title}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-60px' }}
                  variants={fadeUp}
                  transition={{ duration: 0.5, delay: (index % 3) * 0.06, ease: 'easeOut' }}
                  className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-primary-clr">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold text-primary-clr">{module.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-600">{module.description}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white px-5 py-24 md:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Built for every team"
            title="The right view for each role"
            description="Litsamaiso is role-aware from the ground up. Pick a role to see what it does."
          />
          <div className="mt-12 flex flex-wrap justify-center gap-2" role="tablist">
            {roles.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === activeRole}
                onClick={() => setActiveRole(item.id)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-semibold transition',
                  item.id === activeRole
                    ? 'border-primary-clr bg-primary-clr text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:text-primary-clr',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <motion.div
            key={role.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto mt-10 grid max-w-4xl gap-8 rounded-4xl border border-gray-200 bg-gray-50 p-8 md:grid-cols-[auto_1fr] md:p-10"
            role="tabpanel"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-clr text-white">
              <RoleIcon className="h-7 w-7" />
            </span>
            <div>
              <h3 className="text-2xl font-semibold text-primary-clr">{role.label}</h3>
              <p className="mt-2 text-gray-600">{role.summary}</p>
              <ul className="mt-6 space-y-3">
                {role.points.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-sm text-gray-700">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-clr" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="px-5 py-24 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Trust & control"
              title="Designed for sensitive student data"
              description="Student financial information deserves care. Litsamaiso is built around least-privilege access and accountability."
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {trustPoints.map((point) => {
              const Icon = point.icon;
              return (
                <div key={point.title} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                  <Icon className="h-5 w-5 text-primary-clr" />
                  <h3 className="mt-4 font-semibold text-primary-clr">{point.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{point.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 md:px-8">
        <div className="mx-auto max-w-5xl rounded-4xl border border-gray-200 bg-white px-6 py-14 shadow-md md:px-12">
          <div className="text-center">
            <SectionLabel>Getting started</SectionLabel>
            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-semibold text-primary-clr md:text-5xl">
              Live in an afternoon, not a semester
            </h2>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {onboardingSteps.map((step, index) => (
              <li key={step.title} className="relative">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-clr text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-primary-clr">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 flex justify-center">
            <Link
              to="/pricing"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary-clr px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-clr/90"
            >
              Choose your plan
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default ProductPage;
