import React, { useState } from 'react';
import { Link, NavLink as RouterNavLink } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const primaryLinks = [
  { to: '/product', label: 'Product' },
  { to: '/pricing', label: 'Pricing' },
];

const pillLinkClass =
  'rounded-full px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-primary-clr';

export const MarketingLogo = () => (
  <Link to="/" className="flex items-center gap-3">
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-100">
      <img src="/logo-1.png" alt="" className="h-6 w-6" />
    </span>
    <span className="text-lg font-semibold text-primary-clr">Litsamaiso</span>
  </Link>
);

interface MarketingNavProps {
  /** Extra in-page anchor links (e.g. landing page sections). */
  anchors?: { href: string; label: string }[];
  className?: string;
}

export const MarketingNav: React.FC<MarketingNavProps> = ({ anchors = [], className }) => {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  const links = (
    <>
      {primaryLinks.map((link) => (
        <RouterNavLink
          key={link.to}
          to={link.to}
          onClick={() => setOpen(false)}
          className={({ isActive }) => cn(pillLinkClass, isActive && 'bg-gray-100 text-primary-clr')}
        >
          {link.label}
        </RouterNavLink>
      ))}
      {anchors.map((anchor) => (
        <a key={anchor.href} href={anchor.href} onClick={() => setOpen(false)} className={pillLinkClass}>
          {anchor.label}
        </a>
      ))}
    </>
  );

  return (
    <nav className={cn('relative z-20 mx-auto max-w-7xl px-5 py-6 md:px-8', className)}>
      <div className="flex items-center justify-between">
        <MarketingLogo />

        <div className="hidden items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm md:flex">
          {links}
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={isAuthenticated ? '/dashboard' : '/login'}
            className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-primary-clr transition hover:bg-gray-100 sm:inline-flex"
          >
            {isAuthenticated ? 'Dashboard' : 'Sign in'}
          </Link>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-full bg-primary-clr px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary-clr/90"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-primary-clr md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-1 rounded-3xl border border-gray-200 bg-white p-3 shadow-lg md:hidden">
          {links}
          <Link
            to={isAuthenticated ? '/dashboard' : '/login'}
            onClick={() => setOpen(false)}
            className={pillLinkClass}
          >
            {isAuthenticated ? 'Dashboard' : 'Sign in'}
          </Link>
        </div>
      )}
    </nav>
  );
};

export const MarketingFooter = () => (
  <footer className="border-t border-gray-200 bg-gray-100 py-10">
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 md:flex-row md:items-start md:justify-between md:px-8">
      <div>
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-200">
            <img src="/logo-1.png" alt="" className="h-6 w-6" />
          </span>
          <span className="text-lg font-semibold text-primary-clr">Litsamaiso</span>
        </Link>
        <p className="mt-3 max-w-md text-sm leading-6 text-gray-500">
          Academic support, confirmations, and student operations made clearer for every team involved.
        </p>
        <a
          href="mailto:support@litsamaiso.com"
          className="mt-3 inline-flex text-sm font-medium text-primary-clr transition hover:text-active"
        >
          support@litsamaiso.com
        </a>
      </div>
      <div className="grid grid-cols-2 gap-10 text-sm">
        <div className="space-y-3">
          <p className="font-semibold text-primary-clr">Platform</p>
          <Link to="/product" className="block text-gray-500 hover:text-primary-clr">Product</Link>
          <Link to="/pricing" className="block text-gray-500 hover:text-primary-clr">Pricing</Link>
          <Link to="/onboarding" className="block text-gray-500 hover:text-primary-clr">Onboard your institution</Link>
        </div>
        <div className="space-y-3">
          <p className="font-semibold text-primary-clr">Access</p>
          <Link to="/login" className="block text-gray-500 hover:text-primary-clr">Sign in</Link>
          <Link to="/register" className="block text-gray-500 hover:text-primary-clr">Student sign up</Link>
        </div>
      </div>
    </div>
  </footer>
);

export const MarketingLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative min-h-screen w-full overflow-x-hidden bg-gray-50">
    <MarketingNav />
    <main>{children}</main>
    <MarketingFooter />
  </div>
);

export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm font-semibold uppercase text-active-clr">{children}</p>
);

export const SectionHeading = ({
  eyebrow,
  title,
  description,
  align = 'center',
  as: Heading = 'h2',
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  as?: 'h1' | 'h2';
}) => (
  <div className={cn('space-y-4', align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl')}>
    <SectionLabel>{eyebrow}</SectionLabel>
    <Heading
      className={cn(
        'font-semibold text-primary-clr',
        Heading === 'h1' ? 'text-4xl leading-[1.05] md:text-6xl' : 'text-3xl md:text-5xl',
      )}
    >
      {title}
    </Heading>
    {description && <p className="text-base leading-7 text-gray-600 md:text-lg">{description}</p>}
  </div>
);
