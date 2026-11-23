import React, { useEffect, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { academicYearOf, currentStartYear, MAX_START_YEAR, MIN_START_YEAR, shortAcademicYear, startYearOf } from './term';

// The term pickers used across Room Allocation: an academic year chosen from a calendar of years, and the
// semester chosen from a menu. Both only ever give a valid value, so nothing downstream sees a half-typed year.

const PAGE = 12;
const COLUMNS = 3;
const clampPage = (start: number) => Math.min(Math.max(start, MIN_START_YEAR), MAX_START_YEAR - PAGE + 1);
// The page that shows `year` in its second row, so the years either side are in view
const pageFor = (year: number) => clampPage(year - COLUMNS - (year % COLUMNS));

const triggerClass = 'inline-flex h-11 items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3 text-left shadow-sm transition hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60';

export const AcademicYearPicker: React.FC<{ value: string; onChange: (value: string) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const selected = startYearOf(value);
  const thisYear = currentStartYear();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(() => pageFor(selected));
  const [focused, setFocused] = useState(selected);
  const cells = useRef(new Map<number, HTMLButtonElement>());

  const changeOpen = (next: boolean) => {
    if (next) {
      setPage(pageFor(selected));
      setFocused(selected);
    }
    setOpen(next);
  };

  // Keeps keyboard focus on the year the arrow keys moved to, turning the page when it leaves this one
  useEffect(() => {
    if (open) cells.current.get(focused)?.focus();
  }, [open, focused, page]);

  const moveFocus = (year: number) => {
    const next = Math.min(Math.max(year, MIN_START_YEAR), MAX_START_YEAR);
    if (next < page || next >= page + PAGE) setPage(clampPage(next < page ? next - PAGE + 1 : next));
    setFocused(next);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS, PageUp: -PAGE, PageDown: PAGE }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      moveFocus(focused + step);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      moveFocus(event.key === 'Home' ? page : page + PAGE - 1);
    }
  };

  const choose = (year: number) => {
    onChange(academicYearOf(year));
    setOpen(false);
  };

  const years = Array.from({ length: PAGE }, (_, index) => page + index);
  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button type="button" aria-label={`Academic year ${value}. Change`} className={triggerClass}>
          <span className="rounded-md bg-blue-50 p-1.5 text-blue-700"><CalendarDays className="h-4 w-4" /></span>
          <span className="leading-tight">
            <span className="block text-[11px] font-medium text-slate-500">Academic year</span>
            <span className="block text-sm font-semibold tabular-nums text-slate-900">{value}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className="z-60 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl" onOpenAutoFocus={(event) => event.preventDefault()}>
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Earlier years" disabled={page <= MIN_START_YEAR} onClick={() => setPage(clampPage(page - PAGE))} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold tabular-nums text-slate-900" aria-live="polite">{shortAcademicYear(page)} – {shortAcademicYear(page + PAGE - 1)}</span>
            <button type="button" aria-label="Later years" disabled={page + PAGE > MAX_START_YEAR} onClick={() => setPage(clampPage(page + PAGE))} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div role="grid" aria-label="Academic years" onKeyDown={onKeyDown} className="mt-2 grid grid-cols-3 gap-1.5">
            {years.map((year) => {
              const isSelected = year === selected;
              const isCurrent = year === thisYear;
              return (
                <button
                  key={year}
                  ref={(element) => { if (element) cells.current.set(year, element); else cells.current.delete(year); }}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={`${academicYearOf(year)}${isCurrent ? ', this year' : ''}`}
                  tabIndex={year === focused ? 0 : -1}
                  onFocus={() => setFocused(year)}
                  onClick={() => choose(year)}
                  className={`h-11 rounded-lg text-sm font-semibold tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isSelected ? 'bg-button text-white' : isCurrent ? 'text-blue-700 ring-1 ring-inset ring-blue-300 hover:bg-blue-50' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                  {shortAcademicYear(year)}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
            <span>Two semesters per year</span>
            <button type="button" onClick={() => choose(thisYear)} className="rounded-md px-2 py-1 font-semibold text-blue-700 hover:bg-blue-50">This year</button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

const SEMESTERS = [1, 2] as const;

// Styled to match the academic-year trigger beside it. Radix's radio menu provides the arrow keys,
// typeahead, Escape and focus return.
export const SemesterPicker: React.FC<{ value: number; onChange: (value: number) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild disabled={disabled}>
      <button type="button" aria-label={`Semester ${value}. Change`} className={`group ${triggerClass}`}>
        <span className="rounded-md bg-blue-50 p-1.5 text-blue-700"><Layers className="h-4 w-4" /></span>
        <span className="leading-tight">
          <span className="block text-[11px] font-medium text-slate-500">Semester</span>
          <span className="block text-sm font-semibold tabular-nums text-slate-900">Semester {value}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="z-60 min-w-(--radix-dropdown-menu-trigger-width) rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
      >
        <DropdownMenu.RadioGroup value={String(value)} onValueChange={(next) => onChange(Number(next))}>
          {SEMESTERS.map((semester) => (
            <DropdownMenu.RadioItem
              key={semester}
              value={String(semester)}
              className="flex h-10 cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-3 text-sm text-slate-700 outline-none data-highlighted:bg-slate-100 data-[state=checked]:font-semibold data-[state=checked]:text-slate-900"
            >
              Semester {semester}
              <DropdownMenu.ItemIndicator><Check className="h-4 w-4 text-blue-700" /></DropdownMenu.ItemIndicator>
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);
