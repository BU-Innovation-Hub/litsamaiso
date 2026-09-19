import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Check, ChevronDown, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarketingLayout, SectionHeading } from '@/components/marketing/MarketingChrome';
import { PLANS, formatMaluti, formatRand, formatStudentCap } from '@/config/plans';

const comparisonRows: { label: string; values: [string | boolean, string | boolean, string | boolean] }[] = [
  { label: 'Students', values: ['Up to 2,000', 'Up to 10,000', 'Unlimited'] },
  { label: 'Staff accounts (Finance, Registry, SAAD)', values: ['Unlimited', 'Unlimited', 'Unlimited'] },
  { label: 'Account confirmations & financial clearance', values: [true, true, true] },
  { label: 'Student registry & bulk imports', values: [true, true, true] },
  { label: 'Student issues & resolution tracking', values: [true, true, true] },
  { label: 'Secure student elections', values: [true, true, true] },
  { label: 'Reports & exports', values: [true, true, true] },
  { label: 'Branded workspace (colours & logo)', values: [true, true, true] },
  { label: 'Audit trail', values: [true, true, true] },
];

const faqs = [
  {
    q: 'Why am I charged in South African Rand?',
    a: 'Our payment processor settles in ZAR. The Loti is pegged 1:1 to the Rand, so the Maluti price you see is exactly the amount charged — M75,000 is R75,000.',
  },
  {
    q: 'Who becomes the administrator?',
    a: 'The person who completes onboarding becomes the Institution Admin for their institution. They can then add Finance, Registry and SAAD staff, import students, and manage accounts and reports.',
  },
  {
    q: 'What happens if we grow past our student limit?',
    a: 'You will see a warning as you approach the limit. You can upgrade at any time from Billing, and the new limit applies immediately.',
  },
  {
    q: 'How does billing work?',
    a: 'Plans are billed annually by card through Stripe and renew automatically. You can update your card, download invoices, change plan or cancel from the Billing page.',
  },
  {
    q: 'What if a payment fails?',
    a: 'Your workspace stays fully available for a 14-day grace period while you update your payment details. After that, access is paused until the subscription is renewed — your data is kept.',
  },
];

const PricingPage = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <MarketingLayout>
      <section className="relative px-5 pb-16 pt-10 md:px-8 md:pt-16">
        <SectionHeading
          as="h1"
          eyebrow="Pricing"
          title="Simple annual plans for every institution"
          description="Every plan includes the full Litsamaiso platform. Choose the plan that fits the size of your student body."
        />

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <motion.article
              key={plan.key}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.08, ease: 'easeOut' }}
              className={cn(
                'relative flex flex-col rounded-4xl border bg-white p-8 shadow-sm',
                plan.popular ? 'border-primary-clr shadow-xl lg:-translate-y-3' : 'border-gray-200',
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-8 rounded-full bg-primary-clr px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}
              <h2 className="text-xl font-semibold text-primary-clr">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-gray-600">{plan.tagline}</p>
              <p className="mt-6 flex items-baseline gap-2">
                <span className="text-5xl font-semibold tracking-tight text-primary-clr">{formatMaluti(plan.priceLsl)}</span>
                <span className="text-sm font-medium text-gray-500">/ year</span>
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Billed annually as {formatRand(plan.priceLsl)} (ZAR)
              </p>

              <Link
                to={`/onboarding?plan=${plan.key}`}
                className={cn(
                  'mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5',
                  plan.popular
                    ? 'bg-primary-clr text-white hover:bg-primary-clr/90'
                    : 'border border-gray-200 bg-white text-primary-clr hover:bg-gray-50',
                )}
              >
                Get started with {plan.name}
                <ArrowRight className="h-4 w-4" />
              </Link>

              <ul className="mt-8 space-y-3 border-t border-gray-100 pt-8">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-start gap-3 text-sm text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-clr" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-gray-500">
          Prices shown in Maluti. The Loti is pegged 1:1 to the South African Rand, and payments are processed in ZAR.
        </p>
      </section>

      <section className="px-5 py-16 md:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading eyebrow="Compare plans" title="Everything included, sized to you" />
          <div className="mt-12 overflow-x-auto rounded-3xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="p-5 font-semibold text-gray-500">Feature</th>
                  {PLANS.map((plan) => (
                    <th key={plan.key} className="p-5 font-semibold text-primary-clr">
                      {plan.name}
                      <span className="block text-xs font-normal text-gray-500">{formatStudentCap(plan.studentCap)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-gray-100 last:border-0">
                    <td className="p-5 text-gray-700">{row.label}</td>
                    {row.values.map((value, index) => (
                      <td key={index} className="p-5 text-gray-700">
                        {value === true ? (
                          <Check className="h-4 w-4 text-primary-clr" aria-label="Included" />
                        ) : (
                          value
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 md:px-8">
        <div className="mx-auto max-w-3xl">
          <SectionHeading eyebrow="FAQ" title="Questions, answered" />
          <div className="mt-12 divide-y divide-gray-200 rounded-3xl border border-gray-200 bg-white">
            {faqs.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div key={faq.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : index)}
                    className="flex w-full items-center justify-between gap-4 p-6 text-left"
                    aria-expanded={open}
                  >
                    <span className="font-semibold text-primary-clr">{faq.q}</span>
                    <ChevronDown className={cn('h-5 w-5 shrink-0 text-gray-400 transition', open && 'rotate-180')} />
                  </button>
                  {open && <p className="px-6 pb-6 text-sm leading-6 text-gray-600">{faq.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 pt-8 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 rounded-4xl border border-gray-200 bg-white px-8 py-10 shadow-md md:flex-row">
          <div>
            <h2 className="text-2xl font-semibold text-primary-clr">Need something bespoke?</h2>
            <p className="mt-2 text-sm text-gray-600">
              Multi-campus groups, custom integrations or procurement paperwork — we'll work it out with you.
            </p>
          </div>
          <a
            href="mailto:support@litsamaiso.com?subject=Litsamaiso%20sales%20enquiry"
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-primary-clr shadow-sm transition hover:bg-gray-50"
          >
            <Mail className="h-4 w-4" />
            Contact sales
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default PricingPage;
