import React from 'react';
import type { Lecturer, ModuleInput } from '../../services/timetablingService';
import { ROOM_TYPE_OPTIONS } from './moduleForm';
import { inputClass, labelClass } from './shared';

// A module's fields, the same in the Modules tab and when editing a class from the timetable

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

const ModuleFields: React.FC<{
  form: ModuleInput;
  lecturers: Lecturer[];
  set: <K extends keyof ModuleInput>(key: K, value: ModuleInput[K]) => void;
  // The code is what the timetable and imports match on, so it is fixed once the module is on a timetable
  codeLocked?: boolean;
}> = ({ form, lecturers, set, codeLocked }) => {
  // A module can name a lecturer who has since been deleted; keep them selectable rather than silently switching
  const knownLecturer = lecturers.some((lecturer) => lecturer._id === form.lecturer);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <label className={labelClass}>Code<input required readOnly={codeLocked} value={form.code} onChange={(event) => set('code', event.target.value)} placeholder="CS101" className={`${inputClass} ${codeLocked ? 'bg-slate-50 text-slate-500' : ''}`} /></label>
        <label className={labelClass}>Name<input required maxLength={200} value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Introduction to Programming" className={inputClass} /></label>
      </div>
      <label className={labelClass}>Lecturer
        <select required value={form.lecturer} onChange={(event) => set('lecturer', event.target.value)} className={inputClass}>
          {!knownLecturer && <option value="">Choose a lecturer</option>}
          {lecturers.map((lecturer) => <option key={lecturer._id} value={lecturer._id}>{lecturer.name}</option>)}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>Classes per week
          <select value={form.sessionsPerWeek} onChange={(event) => set('sessionsPerWeek', Number(event.target.value))} className={inputClass}>
            {range(1, 5).map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label className={labelClass}>Hours per class
          <select value={form.durationHours} onChange={(event) => set('durationHours', Number(event.target.value))} className={inputClass}>
            {range(1, 4).map((hours) => <option key={hours} value={hours}>{hours} hour{hours === 1 ? '' : 's'}</option>)}
          </select>
        </label>
        <label className={labelClass}>Credits
          <input type="number" required min={1} max={100} step={1} value={form.credits} onChange={(event) => set('credits', Number(event.target.value))} className={inputClass} />
        </label>
        <label className={labelClass}>Batches
          <select value={form.batches} onChange={(event) => set('batches', Number(event.target.value))} className={inputClass}>
            {range(1, 20).map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
      </div>
      <label className={labelClass}>Room type preference
        <select value={form.preferredRoomType} onChange={(event) => set('preferredRoomType', event.target.value)} className={inputClass}>
          {ROOM_TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className={labelClass}>Specific requirements
        <input maxLength={500} value={form.specificRequirements} onChange={(event) => set('specificRequirements', event.target.value)} placeholder="For example: projector, whiteboard" className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.requiresComputers} onChange={(event) => set('requiresComputers', event.target.checked)} /> Needs a computer lab</label>
    </>
  );
};

export default ModuleFields;
