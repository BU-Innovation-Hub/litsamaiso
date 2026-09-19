import React from 'react';
import { BarChart3, FileSpreadsheet, LayoutDashboard, Users, Wallet } from 'lucide-react';
import { cn } from '../lib/utils';
import { buildThemeVariables, type InstitutionTheme } from './palette';

interface WorkspacePreviewProps {
  theme: InstitutionTheme;
  institutionName?: string;
  logoUrl?: string;
  className?: string;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Users, label: 'Users' },
  { icon: Wallet, label: 'Accounts' },
  { icon: FileSpreadsheet, label: 'Reports' },
];

/**
 * A miniature, non-interactive dashboard rendered with a theme's CSS variables
 * scoped to this element, so it previews a theme without touching the page.
 */
export const WorkspacePreview: React.FC<WorkspacePreviewProps> = ({ theme, institutionName, logoUrl, className }) => {
  const style = buildThemeVariables(theme) as React.CSSProperties;

  return (
    <div
      style={style}
      className={cn('overflow-hidden rounded-2xl border border-slate-200 shadow-xl', className)}
      aria-label="Workspace preview"
      role="img"
    >
      <div className="flex h-72 bg-brand-surface text-[10px] sm:h-80">
        <aside className="flex w-[32%] flex-col border-r border-brand-sidebar-border bg-brand-sidebar p-3">
          <div className="flex items-center gap-2 border-b border-brand-sidebar-border pb-3">
            <img src={logoUrl || '/logo-1.png'} alt="" className="h-5 w-5 rounded object-contain" />
            <span className="truncate font-bold text-brand-sidebar-heading">{institutionName || 'Your institution'}</span>
          </div>
          <nav className="mt-3 space-y-1">
            {navItems.map(({ icon: Icon, label, active }) => (
              <span
                key={label}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1.5 font-semibold',
                  active ? 'bg-brand-active text-brand-active-foreground' : 'text-brand-sidebar-foreground',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </span>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-1.5 border-t border-brand-sidebar-border pt-2">
            <span className="h-5 w-5 rounded-full bg-brand-sidebar-heading" />
            <span className="h-1.5 w-12 rounded-full bg-brand-sidebar-muted/60" />
          </div>
        </aside>

        <main className="flex-1 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-primary-clr">Good morning</p>
              <p className="text-slate-500">Here's what needs attention today</p>
            </div>
            <span className="rounded-md bg-brand-accent px-2.5 py-1.5 font-semibold text-brand-accent-foreground">
              Import students
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Students', '1,284'],
              ['Confirmed', '86%'],
              ['Open issues', '12'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-brand-surface-raised p-2">
                <p className="text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-bold text-primary-clr">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 bg-brand-surface-raised p-2">
            <div className="flex items-center gap-1 font-semibold text-primary-clr">
              <BarChart3 className="h-3 w-3" /> Confirmations this week
            </div>
            <div className="mt-2 flex h-16 items-end gap-1.5">
              {[40, 62, 48, 80, 56, 90, 70].map((height, index) => (
                <span
                  key={index}
                  className={cn('flex-1 rounded-t', index === 5 ? 'bg-brand-accent' : 'bg-brand-primary/15')}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
