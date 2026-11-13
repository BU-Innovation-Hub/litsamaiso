import React, { useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { academicYearInputProps, currentAcademicYear } from '../components/elections/electionHelpers';
import ImportModal from '../components/timetabling/ImportModal';
import LecturersTab from '../components/timetabling/LecturersTab';
import ModulesTab from '../components/timetabling/ModulesTab';
import RoomsTab from '../components/timetabling/RoomsTab';
import TimetableTab from '../components/timetabling/TimetableTab';

type Tab = 'timetable' | 'modules' | 'lecturers' | 'rooms';
const TABS: Array<[Tab, string]> = [['timetable', 'Timetable'], ['modules', 'Modules'], ['lecturers', 'Lecturers'], ['rooms', 'Rooms']];
const isAcademicYear = (value: string) => {
  const match = /^(\d{4})\/(\d{4})$/.exec(value);
  return Boolean(match) && Number(match?.[2]) === Number(match?.[1]) + 1;
};

const tabFromUrl = (): Tab => {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return TABS.some(([id]) => id === tab) ? (tab as Tab) : 'timetable';
};

const RoomAllocationPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  const [yearInput, setYearInput] = useState(currentAcademicYear);
  const [semester, setSemester] = useState(1);
  // Only a complete, valid year reaches the tabs, so typing doesn't fire requests
  const [academicYear, setAcademicYear] = useState(currentAcademicYear);
  const term = useMemo(() => ({ academicYear, semester }), [academicYear, semester]);
  const [importing, setImporting] = useState(false);
  // Bumped after an import so the open tab loads again
  const [loaded, setLoaded] = useState(0);

  const changeTab = (next: Tab) => {
    setTab(next);
    window.history.replaceState({}, '', `${window.location.pathname}${next === 'timetable' ? '' : `?tab=${next}`}`);
  };
  const changeYear = (value: string) => {
    setYearInput(value);
    if (isAcademicYear(value)) setAcademicYear(value);
  };
  const usesTerm = tab === 'timetable' || tab === 'modules';

  return (
    <div className="global-bg min-h-screen pt-5 pb-14">
      <div className="mx-auto max-w-6xl space-y-6 px-4">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary-clr">Room Allocation</h1>
            <p className="mt-1 text-sm text-muted-foreground">Set up rooms, lecturers and modules, then generate a clash-free class timetable.</p>
          </div>
          {usesTerm && (
            <div className="flex flex-wrap items-center gap-3">
              <input {...academicYearInputProps} aria-label="Academic year" value={yearInput} onChange={(event) => changeYear(event.target.value)} className={`block w-32 rounded-md border px-3 py-2 text-sm ${isAcademicYear(yearInput) ? 'border-slate-300' : 'border-rose-400'}`} />
              <select aria-label="Semester" value={semester} onChange={(event) => setSemester(Number(event.target.value))} className="block rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value={1}>Semester 1</option>
                <option value={2}>Semester 2</option>
              </select>
            </div>
          )}
        </header>
        <div className="rounded-md bg-white shadow-sm">
          <nav className="flex flex-wrap items-center gap-6 px-4 py-3">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => changeTab(id)} className={`border-b-2 pb-2 text-sm font-medium ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}>{label}</button>
            ))}
            <button type="button" onClick={() => setImporting(true)} className="ml-auto inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileSpreadsheet className="h-4 w-4" /> Import from Excel</button>
          </nav>
        </div>
        {tab === 'timetable' && <TimetableTab key={loaded} term={term} />}
        {tab === 'modules' && <ModulesTab key={loaded} term={term} />}
        {tab === 'lecturers' && <LecturersTab key={loaded} />}
        {tab === 'rooms' && <RoomsTab key={loaded} />}
        {importing && <ImportModal term={term} onClose={() => setImporting(false)} onImported={() => setLoaded((count) => count + 1)} />}
      </div>
    </div>
  );
};

export default RoomAllocationPage;
