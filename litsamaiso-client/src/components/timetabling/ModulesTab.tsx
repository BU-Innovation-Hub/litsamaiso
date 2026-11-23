import React, { useCallback, useState } from 'react';
import { Edit, Monitor, Plus, Trash2, UserMinus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '../../utils/apiError';
import { timetablingService, type CourseModule, type Lecturer, type ModuleInput, type ModuleStudent, type Term } from '../../services/timetablingService';
import ModuleFields from './ModuleFields';
import { moduleForm } from './moduleForm';
import { cell, dangerIconButton, iconButton, inputClass, labelClass, Modal, secondaryButton, Table } from './shared';
import { useResource } from './useResource';

const ModuleStudentsModal: React.FC<{ module: CourseModule; onClose: () => void; onChanged: () => void }> = ({ module, onClose, onChanged }) => {
  const fetchStudents = useCallback(() => timetablingService.listModuleStudents(module._id), [module._id]);
  const { data: students, reload: load } = useResource<ModuleStudent[]>(fetchStudents, [], 'Unable to load students');
  const [pasted, setPasted] = useState('');
  const [notFound, setNotFound] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const result = await timetablingService.addModuleStudents(module._id, pasted);
      setNotFound(result.notFound);
      setPasted(result.notFound.join('\n'));
      toast.success(`${result.added} student${result.added === 1 ? '' : 's'} added${result.alreadyEnrolled ? `, ${result.alreadyEnrolled} already enrolled` : ''}`);
      load();
      onChanged();
    } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to add students')); }
    finally { setBusy(false); }
  };

  const remove = async (student: ModuleStudent) => {
    try { await timetablingService.removeModuleStudent(module._id, student._id); load(); onChanged(); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Unable to remove student')); }
  };

  return (
    <Modal wide title={`${module.code} students`} subtitle={`${students.length} enrolled · taught by ${module.lecturer?.name || 'no lecturer'}`} busy={busy} submitLabel="Add students" onClose={onClose} onSubmit={add}>
      <label className={labelClass}>
        Student numbers
        <textarea required rows={4} value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="Paste a column of student numbers, or separate them with commas" className={inputClass} />
      </label>
      {notFound.length > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notFound.length} student number{notFound.length === 1 ? ' is' : 's are'} not in the Student Registry and {notFound.length === 1 ? 'was' : 'were'} left in the box: {notFound.slice(0, 10).join(', ')}{notFound.length > 10 ? '...' : ''}
        </p>
      )}
      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
        {students.length === 0
          ? <p className="px-4 py-6 text-center text-sm text-slate-500">No students enrolled yet.</p>
          : <ul className="divide-y divide-slate-100">{students.map((student) => (
            <li key={student._id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span><span className="font-medium text-slate-900">{student.name} {student.surname}</span> <span className="text-slate-500">· {student.studentId}</span></span>
              <button type="button" title="Remove from module" aria-label={`Remove ${student.name} ${student.surname}`} onClick={() => void remove(student)} className="rounded-md p-1.5 text-rose-700 hover:bg-rose-50"><UserMinus className="h-4 w-4" /></button>
            </li>
          ))}</ul>}
      </div>
    </Modal>
  );
};

const ModulesTab: React.FC<{ term: Term }> = ({ term }) => {
  const fetchModules = useCallback(() => timetablingService.listModules(term), [term]);
  const { data: loadedModules, loading, reload: load } = useResource<CourseModule[]>(fetchModules, [], 'Unable to load modules');
  // Never show the previous semester's list while the new one loads
  const modules = loadedModules.filter((module) => module.academicYear === term.academicYear && module.semester === term.semester);
  const { data: lecturers } = useResource<Lecturer[]>(timetablingService.listLecturers, [], 'Unable to load lecturers');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; form: ModuleInput } | null>(null);
  const [enrolling, setEnrolling] = useState<CourseModule | null>(null);

  const blank = (): ModuleInput => ({ ...term, code: '', name: '', lecturer: lecturers[0]?._id || '', requiresComputers: false, sessionsPerWeek: 2, durationHours: 2, credits: 10, batches: 1, preferredRoomType: 'any', specificRequirements: '' });

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) await timetablingService.updateModule(editing.id, editing.form);
      else await timetablingService.createModule(editing.form);
      toast.success(`${editing.form.code.toUpperCase()} saved`);
      setEditing(null);
      load();
    } catch (error) { toast.error(getApiErrorMessage(error, 'Unable to save module')); }
    finally { setBusy(false); }
  };

  const remove = async (module: CourseModule) => {
    if (!window.confirm(`Delete ${module.code}? Its classes come off the current timetables.`)) return;
    try { await timetablingService.deleteModule(module._id); toast.success(`${module.code} deleted`); load(); }
    catch (error) { toast.error(getApiErrorMessage(error, 'Unable to delete module')); }
  };

  const set = <K extends keyof ModuleInput>(key: K, value: ModuleInput[K]) => editing && setEditing({ ...editing, form: { ...editing.form, [key]: value } });

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Modules for {term.academicYear} semester {term.semester}</h2>
          <p className="text-sm text-muted-foreground">Students who share a module are never timetabled into two classes at once.</p>
        </div>
        <button type="button" disabled={!lecturers.length} title={lecturers.length ? undefined : 'Add a lecturer first'} onClick={() => setEditing({ form: blank() })} className={secondaryButton}><Plus className="h-4 w-4" /> Add module</button>
      </div>
      <div className="mt-5">
        <Table headers={['Module', 'Lecturer', 'Students', 'Classes per week', 'Room type', 'Actions']} empty={lecturers.length ? 'No modules for this semester yet.' : 'Add lecturers first, then add their modules.'} loading={loading} rowCount={modules.length}>
          {modules.map((module) => (
            <tr key={module._id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm"><span className="font-semibold text-slate-950">{module.code}</span><span className="block text-slate-500">{module.name}</span></td>
              <td className={cell}>{module.lecturer?.name || '-'}</td>
              <td className={cell}>{module.studentCount}</td>
              <td className={cell}>{module.sessionsPerWeek} × {module.durationHours}h</td>
              <td className={cell}>{module.requiresComputers ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"><Monitor className="h-3.5 w-3.5" /> Computer lab</span> : 'Any room'}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                <button type="button" title="Students" aria-label={`${module.code} students`} onClick={() => setEnrolling(module)} className={`${iconButton} mr-2`}><Users className="h-4 w-4" /></button>
                <button type="button" title="Edit module" aria-label={`Edit ${module.code}`} onClick={() => setEditing({ id: module._id, form: moduleForm(module) })} className={`${iconButton} mr-2`}><Edit className="h-4 w-4" /></button>
                <button type="button" title="Delete module" aria-label={`Delete ${module.code}`} onClick={() => void remove(module)} className={dangerIconButton}><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      {editing && (
        <Modal title={editing.id ? `Edit ${editing.form.code}` : 'Add module'} subtitle={`${term.academicYear} semester ${term.semester}`} busy={busy} onClose={() => setEditing(null)} onSubmit={save}>
          <ModuleFields form={editing.form} lecturers={lecturers} set={set} />
        </Modal>
      )}

      {enrolling && <ModuleStudentsModal module={enrolling} onClose={() => setEnrolling(null)} onChanged={load} />}
    </section>
  );
};

export default ModulesTab;
